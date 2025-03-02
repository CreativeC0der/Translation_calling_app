
export default async function translateTracks(pc, localStream, from_language, to_language) {
    // Get an ephemeral key from your server - see server code below
    // const tokenResponse = await fetch("/session");
    // const data = await tokenResponse.json();
    let EPHEMERAL_KEY; // Initialize API KEY

    // Create a peer connection
    const openai = new RTCPeerConnection();

    localStream.getTracks().forEach((track) => {
        console.log('Adding Local Stream to Openai');
        openai.addTrack(track, localStream);
    })

    //Send translated tracks to actual Peerconnection
    openai.ontrack = (event) => {
        if (event.track.kind === "audio") {

            console.log("Received translated audio track from OpenAI:", event.track);
            // Create a new MediaStream to hold the received track
            const remoteStream = new MediaStream();
            remoteStream.addTrack(event.track);

            // Add the track to the RTCPeerConnection
            pc.addTrack(event.track, remoteStream);
        }
    };

    // Set up data channel for sending and receiving events
    const dc = openai.createDataChannel("oai-events");

    dc.addEventListener("message", (e) => {
        // Realtime server events appear here!
        console.log(e);
    });

    dc.addEventListener("open", () => {
        console.log("Data channel is open and ready to use.");

        // Send the event once the data channel is open
        const event = {
            type: "session.update",
            session: {
                instructions: `Directly Translate whatever I say to ${to_language} . Do not add any suffix or prefix. `
            },
        };
        dc.send(JSON.stringify(event));
    });

    // Start the session using the Session Description Protocol (SDP)
    const offer = await openai.createOffer();
    await openai.setLocalDescription(offer);

    const baseUrl = "https://api.openai.com/v1/realtime";
    const model = "gpt-4o-realtime-preview-2024-12-17";
    const sdpResponse = await fetch(`${baseUrl}?model=${model}`, {
        method: "POST",
        body: offer.sdp,
        headers: {
            Authorization: `Bearer ${EPHEMERAL_KEY}`,
            "Content-Type": "application/sdp"
        },
    });

    const answer = {
        type: "answer",
        sdp: await sdpResponse.text(),
    };
    await openai.setRemoteDescription(answer);
}
