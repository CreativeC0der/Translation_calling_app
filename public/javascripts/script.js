import translateTracks from './openai_connect.js'

let socket = io()

let user = document.getElementById('userName')
let registerBtn = document.getElementById('registerName')
let contactList = document.getElementById('contactList')
let remoteAudio = document.getElementById('remoteAudio')
let startCall = document.getElementById('startCall')
let muteMic = document.getElementById('muteMicButton')
let status = document.getElementById('status')
let hangup = document.getElementById('hangUp')
let localStream, pc, recipient;

const audioMotion = new AudioMotionAnalyzer(
    document.getElementById('canvas'),
    {
        source: remoteAudio,
        gradient: 'steelblue',
        fillAlpha: 0.5,
        mode: 8, // Use "bar" mode
        barSpace: 0.5, // Reduce space between bars to make them thicker
        radial: true, // Ensure bars are not radial
        center: true, // Center the bars
        showScaleX: false, // Hide the frequency scale for a cleaner look
        showPeaks: false, // Hide peak indicators
        showBgColor: true, // Show background color
        bgAlpha: 1, // Set background opacity
        height: 400, // Set height of the container
        width: 600,
        roundBars: true
    }
);

const createPeerConnection = async (recipient) => {
    pc = new RTCPeerConnection({ 'iceServers': [{ 'urls': 'stun:stun.l.google.com:19302' }] })

    pc.ontrack = (event) => {
        console.log("Received track on Remote side:", event.track);
        // Create a new MediaStream to hold the received track
        const remoteStream = new MediaStream();
        remoteStream.addTrack(event.track);

        // set the remote stream to an audio element to play it
        remoteAudio.srcObject = remoteStream;
    };


    pc.addEventListener('icecandidate', (event) => {
        if (event.candidate) {
            socket.emit('ice-candidate-added', { to: recipient, candidate: event.candidate });
        }
    })

    const openai = await translateTracks(pc, localStream, 'bengali', 'hindi')
}

registerBtn.addEventListener('click', (event) => {
    socket.emit('new-user-registered', user.value)
})

socket.on('user-list-changed', (users) => {
    let html = ''
    for (let user in users) {
        if (user != document.getElementById('userName').value)
            html += `<option value="${user}">${user}</option>`
    }
    contactList.innerHTML = html
})


socket.on('offer', async ({ from, to, offer }) => {
    const call = await Swal.fire({
        title: `Call from ${from}?`,
        text: "Take the call ?",
        icon: "warning",
        showCancelButton: true,
        confirmButtonColor: "#3085d6",
        cancelButtonColor: "#d33",
        confirmButtonText: "Accept!"
    })
    if (!call.isConfirmed) {
        Swal.fire({
            title: "Call Rejected!",
            text: "Oops",
            icon: "error"
        });
    }
    else {
        if (!pc)
            await createPeerConnection(from)
        recipient = from
        await pc.setRemoteDescription(new RTCSessionDescription(offer))
        const answer = await pc.createAnswer()
        await pc.setLocalDescription(answer)
        socket.emit('answer', { from: to, to: from, answer: answer })
        status.textContent = `In call with ${recipient}...`
        hangup.disabled = false;
        hangup.classList.remove('opacity-50', 'cursor-not-allowed')
    }

})

socket.on('answer', async ({ from, to, answer }) => {
    await pc.setRemoteDescription(new RTCSessionDescription(answer))
    status.textContent = `In call with ${recipient}...`
    hangup.disabled = false;
    hangup.classList.remove('opacity-50', 'cursor-not-allowed')
})


socket.on('ice-candidate-added', async (candidate) => {
    if (pc) {
        try {
            await pc.addIceCandidate(new RTCIceCandidate(candidate));
        } catch (error) {
            console.error("Error adding ICE candidate:", error);
        }
    }

})

//call started
startCall.addEventListener('click', async (event) => {
    recipient = contactList.value;
    if (!recipient) {
        alert("Please select a user to call.");
        return;
    }
    await createPeerConnection(recipient);
    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);
    socket.emit('offer', { from: user.value, to: recipient, offer: offer });

    // Ensure audio playback is triggered by a user gesture
    remoteAudio.play().catch((e) => console.error("Autoplay error:", e));
})

const getLocalVideoStream = async () => {
    //get video and audio access
    localStream = await navigator.mediaDevices.getUserMedia({ video: false, audio: true })
}

const endcall = () => {
    if (pc) {
        pc.close();
        pc = null;
    }
    if (localStream) {
        localStream.getTracks().forEach(track => track.stop());
        localStream = null;
    }
    Swal.fire({
        title: "Call Ended!",
        text: "Oops",
        icon: "error"
    });
    status.textContent = 'Call Disconnected..'
}

muteMic.addEventListener('click', function () {
    if (localStream) {
        const audioTracks = localStream.getAudioTracks();
        if (audioTracks.length > 0) {
            audioTracks[0].enabled = !audioTracks[0].enabled;
            this.textContent = audioTracks[0].enabled ? '🎙️ Mute Mic' : '🔇 Unmute Mic';
        }
    }
});

hangup.addEventListener('click', function () {
    endcall()
    console.log('Disconnect from ' + recipient);
    hangup.disabled = true;
    hangup.classList.add('opacity-50', 'cursor-not-allowed')
    socket.emit('end-call', { from: user.value, to: recipient })
});

socket.on('end-call', () => {
    console.log('received end call request')
    hangup.disabled = true;
    hangup.classList.add('opacity-50', 'cursor-not-allowed')
    endcall()
})


getLocalVideoStream(); // Ensure media is added to the new peer connection
