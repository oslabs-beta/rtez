"use strict";
/* eslint-disable @typescript-eslint/no-non-null-assertion */
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || function (mod) {
    if (mod && mod.__esModule) return mod;
    var result = {};
    if (mod != null) for (var k in mod) if (k !== "default" && Object.prototype.hasOwnProperty.call(mod, k)) __createBinding(result, mod, k);
    __setModuleDefault(result, mod);
    return result;
};
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const react_1 = __importStar(require("react"));
const Socket_1 = __importDefault(require("./Socket"));
const VideoComponent_1 = __importDefault(require("./VideoComponent"));
const actions_1 = __importDefault(require("../constants/actions"));
const mediaStreamConstraints_1 = __importDefault(require("../constants/mediaStreamConstraints"));
const rtcConfiguration_1 = __importDefault(require("../constants/rtcConfiguration"));
const { LOGIN, ICECANDIDATE, OFFER, ANSWER, LEAVE } = actions_1.default;
/**
 * @desc Wrapper component containing the logic necessary for peer connections using WebRTC APIs (RTCPeerConnect API + MediaSession API) and WebSockets.
 *
 * ws, localVideo, remoteVideo, peerRef, localStream, otherUser, senders are all mutable ref objects that are created using the useRef hook. The useRef hook allows you to persist values between renders and it is used to store a mutable value that does NOT cause a re-render when updated.
 *
 * The WebSocket connection (ws.current) is established using the useEffect hook and once the component mounts, the Socket component is rendered. The Socket component adds event listeners that handle the offer-answer model and the exchange of SDP objects between peers and the socket.
 *
 * The WebSocket message event will filter through various events to determine the payloads that will be sent to other serverside socket connection via WebSocket.
 *
 * @type {state} username - username state stores the name the client enters. All users (see getUsers) will be able to see an updated list of all other users whenever a new user logs in or leaves.
 * @type {state} users - users state is the list of connected users that is rendered on the frontend.
 *
 * @param {Object} props
 * @param {String} props.URL - ws or wss link
 * @param {object} props.mediaOptions video embed attributes
 * @returns A component that renders two VideoComponents,
 */
const VideoCall = ({ URL, mediaOptions }) => {
    const [username, setUsername] = (0, react_1.useState)('');
    const [users, setUsers] = (0, react_1.useState)();
    /**
     * @type {mutable ref WebSocket object} ws is the mutable ref object that contains the WebSocket object (ws.current). It cannot be null or undefined.
     *
     * @desc The ws.current WebSocket object is created using the useEffect hook and it will establish the WebSocket connection to the server. This WebSocket connection is made on component mount and the function openUserMedia is invoked, which makes a permissions request for the client's video and audio.
     *
     * ws.current.send enqueues the specified messages that need to be transmitted to the server over the WebSocket connection and this WebSocket connection is connected to the server by using RTConnect's importable SignalingChannel module.
     */
    const ws = (0, react_1.useRef)(null);
    /**
     * @type {mutable ref object} localVideo - video stream of the local user. It will not be null or undefined.
     */
    const localVideo = (0, react_1.useRef)(null);
    /**
     * @type {mutable ref object} remoteVideo - video stream of the remote user. It cannot be null or undefined.
     */
    const remoteVideo = (0, react_1.useRef)(null);
    /**
     * @type {mutable ref object} peerRef - It cannot be null or undefined.
     */
    const peerRef = (0, react_1.useRef)(null);
    /**
     * @type {mutable ref string} otherUser -
     */
    const otherUser = (0, react_1.useRef)();
    /**
     * @type {mutable ref object} localStream - It cannot be null or undefined.
     */
    const localStream = (0, react_1.useRef)(null);
    /**
     * @type {mutable ref array} senders -
     */
    const senders = (0, react_1.useRef)([]);
    /**
     * @type {string} userField - the username that is entered in the input field when the Submit Username button is clicked.
    */
    let userField = '';
    /**
     * @type {string} receiver - .
    */
    let receiver = '';
    (0, react_1.useEffect)(() => {
        ws.current = new WebSocket(URL);
        openUserMedia();
    }, []);
    /**
     * A diagram of the WebRTC Connection logic
     * Peer A  Stun    Signaling Channel(WebSockets)  Peer B   Step
     *  |------>|                   |                   |       Who Am I? + RTCPeerConnection(configuration) this contains methods to connect to a remote Peer
     *  |<------|                   |                   |       Symmetric NAT (your ip that you can be connected to)
     *  |-------------------------->|------------------>|       Calling Peer B, Offer SDP is generated and sent over WebSocket
     *  |-------------------------->|------------------>|       ICE Candidates are also being trickled in, where and what IP:PORT can Peer B connect to Peer A
     *  |       |<------------------|-------------------|       Who Am I? PeerB this time!
     *  |       |-------------------|------------------>|       Peer B's NAT
     *  |<--------------------------|-------------------|       Accepting Peer A's call, sending Answer SDP
     *  |<--------------------------|-------------------|       Peer B's ICE Candidates are now being trickled in to peer A for connectivity.
     *  |-------------------------->|------------------>|       ICE Candidates from Peer A, these steps repeat and are only necessary if Peer B can't connect to the earlier candidates sent.
     *  |<--------------------------|-------------------|       ICE Candidate trickling from Peer B, could also take a second if there's a firewall to be circumvented.
     *  |       |                   |                   |       Connected! Peer to Peer connection is made and now both users are streaming data to eachother!
     *
     * If Peer A starts a call their order of functions being invoked is... handleOffer --> callUser --> createPeer --> peerRef.current.negotiationNeeded event (handleNegotiationNeededEvent) --> ^send Offer SDP^ --> start ICE trickle, handleIceCandidateEvent --> ^receive Answer^ SDP --> handleIceCandidateMsg --> once connected, handleTrackEvent
     * If Peer B receives a call then we invoke... ^Receive Offer SDP^ --> handleReceiveCall --> createPeer --> ^send Answer SDP^ --> handleIceCandidateMsg --> handleIceCandidateEvent --> once connected, handleTrackEvent
     *
     * Note: Media is attached to the Peer Connection and sent along with the offers/answers to describe what media each client has. (see RTCPeerConnection.addTrack() MDN)
     */
    /**
     * @func handleUsername
     * @desc When the client enters a username and clicks the Submit Username button, a LOGIN event is triggered and the loginPayload is sent via the WebSocketServer (ws.current.send(loginPayload)) to the backend/server.
     *
     * Then, username state is updated with the string stored in the userField variable (the username entered by the client when they clicked the Submit Username).
    */
    const handleUsername = () => {
        const loginPayload = {
            ACTION_TYPE: LOGIN,
            payload: userField,
        };
        ws.current.send(JSON.stringify(loginPayload));
        setUsername(userField);
    };
    /**
     * @func handleOffer
     * @desc When a username is entered that the client wants to "Call" and the client clicks the Call button,  into the input field, this starts the Offer-Answer Model exchange
     */
    const handleOffer = () => {
        const inputField = document.querySelector('#receiverName');
        if (inputField) {
            receiver = inputField.value;
            inputField.value = '';
            otherUser.current = receiver;
            callUser(receiver);
        }
    };
    /**
     * @function getUser
     * @desc When data (the list of connected users) is received from the WebSocketServer/backend, getUser function is invoked and it updates the userList state so that the list of currently connected users can be displayed on the frontend.
     * @param {Array<string>} parsedData - data (the array of usernames that are connected) that is returned from backend/WebSocketServer.
     * @returns Re-renders the page with the new User List
    */
    const getUsers = (parsedData) => {
        const userList = parsedData.payload.map((name, idx) => (react_1.default.createElement("div", { key: idx }, name)));
        setUsers(userList);
    };
    /**
     * @async
     * @function openUserMedia
     * @param
     * @desc Asks for the client's permissions to open their webcam and microphone.
     */
    const openUserMedia = () => __awaiter(void 0, void 0, void 0, function* () {
        try {
            if (localVideo.current) {
                localStream.current = localVideo.current.srcObject = yield navigator.mediaDevices.getUserMedia(mediaStreamConstraints_1.default);
            }
        }
        catch (error) {
            console.log('Error in openUserMedia: ', error);
        }
    });
    /**
    * @desc Constructs a new RTCPeerConnection object that also adds the local client's media tracks to this object.
    * @param {string} userID
    */
    const callUser = (userID) => {
        peerRef.current = createPeer(userID);
        localStream.current.getTracks().forEach((track) => senders.current.push(peerRef.current.addTrack(track, localStream.current)));
    };
    /**
    * @desc Creates a new RTCPeerConnection object, which represents a WebRTC connection between the local device and a remote peer and adds event listeners to it
    * @param {string} userID
    * @returns {RTCPeerConnection} RTCPeerConnection object
    * @see https://developer.mozilla.org/en-US/docs/Web/API/RTCPeerConnection/connectionstatechange_event and other events
    */
    const createPeer = (userID) => {
        const peer = new RTCPeerConnection(rtcConfiguration_1.default);
        peer.onicecandidate = handleIceCandidateEvent;
        peer.ontrack = handleTrackEvent;
        peer.onnegotiationneeded = () => handleNegotiationNeededEvent(userID);
        console.log('registerPeerConnectionListners has activated');
        peer.addEventListener('negotiationneeded', () => {
            console.log('negotiationneeded event has fired');
        });
        peer.addEventListener('icegatheringstatechange', () => {
            var _a;
            console.log(`ICE gathering state changed: ${(_a = peerRef.current) === null || _a === void 0 ? void 0 : _a.iceGatheringState}`);
        });
        peer.addEventListener('connectionstatechange', () => {
            var _a;
            console.log(`Connection state change: ${(_a = peerRef.current) === null || _a === void 0 ? void 0 : _a.connectionState}`);
            console.log(peerRef.current);
        });
        peer.addEventListener('signalingstatechange', () => {
            var _a;
            console.log(`Signaling state change: ${(_a = peerRef.current) === null || _a === void 0 ? void 0 : _a.signalingState}`);
        });
        peer.addEventListener('iceconnectionstatechange ', () => {
            var _a;
            console.log(`ICE connection state change: ${(_a = peerRef.current) === null || _a === void 0 ? void 0 : _a.iceConnectionState}`);
        });
        return peer;
    };
    /**
     * @function handleNegotiationNeededEvent
     * @desc invokes WebRTC's built-in createOffer() function to create an SDP offer, which is an RTCSessionDescription object. This offer is then set as the local description using WebRTC's built-in setLocalDescription() function. Finally, the offer, sender and receiver is sent via ws.current.send to the Signaling Channel in the backend
     * @param {string} userID
    */
    function handleNegotiationNeededEvent(userID) {
        var _a;
        (_a = peerRef.current) === null || _a === void 0 ? void 0 : _a.createOffer().then((offer) => {
            var _a;
            return (_a = peerRef.current) === null || _a === void 0 ? void 0 : _a.setLocalDescription(offer);
        }).then(() => {
            var _a;
            const offerPayload = {
                ACTION_TYPE: OFFER,
                sender: username,
                receiver: userID,
                payload: (_a = peerRef.current) === null || _a === void 0 ? void 0 : _a.localDescription
            };
            ws.current.send(JSON.stringify(offerPayload));
        }).catch(e => console.log(e));
    }
    /**
    * @desc When an offer is received from the SignalingChannel, this function is invoked, creating a new RTCPeerConnection with the local client's media attached and an Answer is created that is then sent back to the original caller through the WebSocket connection.
    * @param {RTCSessionDescriptionInit} data
    * @see https://developer.mozilla.org/en-US/docs/Web/API/RTCPeerConnection/createAnswer
    */
    function handleReceiveCall(data) {
        otherUser.current = data.sender;
        peerRef.current = createPeer(data.sender);
        const desc = new RTCSessionDescription(data.payload);
        peerRef.current.setRemoteDescription(desc)
            .then(() => {
            var _a;
            (_a = localStream.current) === null || _a === void 0 ? void 0 : _a.getTracks().forEach((track) => { var _a; return (_a = peerRef.current) === null || _a === void 0 ? void 0 : _a.addTrack(track, localStream.current); });
        })
            .then(() => {
            var _a;
            return (_a = peerRef.current) === null || _a === void 0 ? void 0 : _a.createAnswer();
        })
            .then(answer => {
            var _a;
            return (_a = peerRef.current) === null || _a === void 0 ? void 0 : _a.setLocalDescription(answer);
        })
            .then(() => {
            var _a;
            const answerPayload = {
                ACTION_TYPE: ANSWER,
                receiver: data.sender,
                sender: username,
                payload: (_a = peerRef.current) === null || _a === void 0 ? void 0 : _a.localDescription
            };
            ws.current.send(JSON.stringify(answerPayload));
        });
    }
    /**
    * @desc The local client's remote description is set as the incoming Answer SDP to define who we are trying to connect to on the other end of the connection.
    * @param {object} data SDP answer
    */
    function handleAnswer(data) {
        var _a;
        const remoteDesc = new RTCSessionDescription(data.payload);
        (_a = peerRef.current) === null || _a === void 0 ? void 0 : _a.setRemoteDescription(remoteDesc).catch((e) => console.log(e));
    }
    /**
    * @desc As the local client's ICE Candidates are being generated, they are being sent to the remote client to complete the connection
    * @param {RTCPeerConnectionIceEvent} e
    */
    function handleIceCandidateEvent(e) {
        if (e.candidate) { // Contains the RTCIceCandidate containing the candidate associated with the event,
            const IcePayload = {
                ACTION_TYPE: ICECANDIDATE,
                receiver: otherUser.current,
                payload: e.candidate,
            };
            ws.current.send(JSON.stringify(IcePayload));
        }
    }
    /**
    * @desc ICE Candidates being sent from each end of the connection are added to a list of potential connection methods until both ends have a way of connecting to eachother
    * @param {Object} data containing a property payload with an incoming ICE Candidate
    */
    function handleNewIceCandidate(data) {
        var _a;
        const candidate = new RTCIceCandidate(data.payload);
        (_a = peerRef.current) === null || _a === void 0 ? void 0 : _a.addIceCandidate(candidate).catch((e) => console.log(e));
    }
    /**
    * @desc Once the connection is made, the RTCRtpReceiver interface is exposed and this function is then able to extract the MediaStreamTrack from the sender's RTCPeerConnection.
    * @param {RTCTrackEvent} e An Event Object, also contains the stream
    */
    function handleTrackEvent(e) {
        remoteVideo.current.srcObject = e.streams[0];
    }
    /**
    * @desc Enables screen sharing using MediaSession.getDisplayMedia()
    */
    function shareScreen() {
        //TODOS: On a new connection the local and streamed screen bugs producing: Rtconnect.jsx:273 Uncaught (in promise) DOMException: The peer connection is closed.
        navigator.mediaDevices.getDisplayMedia()
            .then(stream => {
            var _a, _b;
            const screenTrack = stream.getTracks()[0];
            (_b = (_a = senders.current) === null || _a === void 0 ? void 0 : _a.find(sender => { var _a; return ((_a = sender.track) === null || _a === void 0 ? void 0 : _a.kind) === 'video'; })) === null || _b === void 0 ? void 0 : _b.replaceTrack(screenTrack);
            localVideo.current.srcObject = stream; // changing local video to reflect what we're sharing to the other end of the connection
            screenTrack.onended = function () {
                var _a, _b;
                (_b = (_a = senders.current) === null || _a === void 0 ? void 0 : _a.find(sender => { var _a; return ((_a = sender.track) === null || _a === void 0 ? void 0 : _a.kind) === 'video'; })) === null || _b === void 0 ? void 0 : _b.replaceTrack(localStream.current.getTracks()[1]);
                localVideo.current.srcObject = localStream.current; // changing local video displayed back to webcam
            };
        });
    }
    /**
    * @desc if any client chooses to end their call then the person who ends the call first closes their connection and resets the remote video component while also sending a message to the remote peer to also go through the same process.
    * @param {boolean} isEnded
    */
    function endCall(isEnded) {
        var _a, _b, _c;
        const LeavePayload = {
            ACTION_TYPE: LEAVE,
            receiver: otherUser.current,
        };
        (_a = peerRef.current) === null || _a === void 0 ? void 0 : _a.close();
        isEnded ? (_b = peerRef.current) === null || _b === void 0 ? void 0 : _b.close() : (_c = ws.current) === null || _c === void 0 ? void 0 : _c.send(JSON.stringify(LeavePayload));
        remoteVideo.current.srcObject = null;
    }
    // const buttonStyling = { 
    //   backgroundColor: '#C2FBD7',
    //   borderRadius: '50px',
    //   borderWidth: '0',
    //   boxShadow: 'rgba(0, 0, 0, 0.15) 0px 2px 8px',
    //   color: '#008000',
    //   cursor: 'pointer',
    //   display: 'inline-block',
    //   fontFamily: 'Arial, Helvetica, sans-serif',
    //   fontSize: '1em',
    //   height: '50px',
    //   padding: '0 25px',
    // };
    /* 'conditionally rendering' if WebSocket has a value otherwise on page re-rendering events
    multiple WebSocket connections will be made and error
    every user when one closes their browser
    */
    return (react_1.default.createElement(react_1.default.Fragment, null,
        ws.current ?
            react_1.default.createElement(Socket_1.default, { ws: ws.current, getUsers: getUsers, handleReceiveCall: handleReceiveCall, handleAnswer: handleAnswer, handleNewIceCandidate: handleNewIceCandidate, endCall: endCall }) :
            '',
        react_1.default.createElement("div", { className: '', style: {
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'space-around',
                marginTop: '10%',
                padding: '10px',
            } },
            username === '' ?
                react_1.default.createElement(react_1.default.Fragment, null,
                    react_1.default.createElement("div", { className: 'input-div', style: {
                            alignItems: 'center',
                            display: 'flex',
                            flexDirection: 'column',
                            height: '100px',
                            justifyContent: 'center',
                            left: '2%',
                            margin: '0 auto',
                            top: '2%',
                            width: '100px'
                        } },
                        react_1.default.createElement("input", { className: '', type: 'text', placeholder: 'username', id: "username-field", onChange: (e) => userField = e.target.value, style: {
                                paddingBottom: '40px',
                                width: '200px'
                            } }),
                        react_1.default.createElement("button", { className: '', "data-testid": 'submit-username-btn', onClick: () => handleUsername(), 
                            // style={ buttonStyling }
                            style: {
                                backgroundColor: '#C2FBD7',
                                borderRadius: '50px',
                                borderWidth: '0',
                                boxShadow: 'rgba(0, 0, 0, 0.15) 0px 2px 8px',
                                color: '#008000',
                                cursor: 'pointer',
                                display: 'inline-block',
                                fontFamily: 'Arial, Helvetica, sans-serif',
                                fontSize: '1em',
                                height: '50px',
                                padding: '0 25px',
                            } }, "Submit Username")))
                :
                    react_1.default.createElement("div", { className: 'users-list', style: {
                            fontFamily: 'Arial, Helvetica, sans-serif',
                            fontSize: '16px'
                        } },
                        "Users connected: ",
                        users),
            react_1.default.createElement("div", { id: "main-video-container", className: '', style: {
                    alignItems: 'center',
                    display: 'flex',
                    flexDirection: 'row',
                    gap: '100px',
                    justifyContent: 'center'
                } },
                react_1.default.createElement("div", { id: "local-video-container", className: '', style: {
                        alignContent: 'center',
                        display: 'flex',
                        flexDirection: 'column',
                        justifyContent: 'center'
                    } },
                    react_1.default.createElement(VideoComponent_1.default, { video: localVideo, mediaOptions: mediaOptions }),
                    react_1.default.createElement("div", { id: "local-button-container", className: '', style: {
                            display: 'flex',
                            flexDirection: 'row',
                            gap: '10px',
                            justifyContent: 'center',
                            marginTop: '10px'
                        } },
                        react_1.default.createElement("button", { className: 'share-btn', "data-testid": 'share-screen-btn', onClick: () => shareScreen(), 
                            // style={buttonStyling}
                            style: {
                                backgroundColor: '#C2FBD7',
                                borderRadius: '50px',
                                borderWidth: '0',
                                boxShadow: 'rgba(0, 0, 0, 0.15) 0px 2px 8px',
                                color: '#008000',
                                cursor: 'pointer',
                                display: 'inline-block',
                                fontFamily: 'Arial, Helvetica, sans-serif',
                                fontSize: '1em',
                                height: '50px',
                                padding: '0 25px',
                            } }, "Share Screen"),
                        react_1.default.createElement("button", { className: 'end-btn', "data-testid": 'end-call-btn', onClick: () => endCall(false), 
                            // style={{ 
                            //   ...buttonStyling, 
                            //   backgroundColor:'#ff6961', 
                            //   color:'#28282B' 
                            // }}
                            style: {
                                // backgroundColor: '#C2FBD7',
                                backgroundColor: '#ff6961',
                                borderRadius: '50px',
                                borderWidth: '0',
                                boxShadow: 'rgba(0, 0, 0, 0.15) 0px 2px 8px',
                                // color: '#008000',
                                color: '#28282B',
                                cursor: 'pointer',
                                display: 'inline-block',
                                fontFamily: 'Arial, Helvetica, sans-serif',
                                fontSize: '1em',
                                height: '50px',
                                padding: '0 25px',
                            } }, "End Call"))),
                react_1.default.createElement("div", { id: "remote-video-container", className: '', style: {
                        alignContent: 'center',
                        display: 'flex',
                        flexDirection: 'column',
                        justifyContent: 'center'
                    } },
                    react_1.default.createElement(VideoComponent_1.default, { video: remoteVideo, mediaOptions: mediaOptions }),
                    react_1.default.createElement("div", { id: "remote-button-container", className: '', style: {
                            display: 'flex',
                            flexDirection: 'row',
                            gap: '10px',
                            justifyContent: 'center',
                            marginTop: '10px'
                        } },
                        react_1.default.createElement("button", { className: '', "data-testid": 'call-btn', onClick: handleOffer, 
                            // style={buttonStyling}
                            style: {
                                backgroundColor: '#C2FBD7',
                                borderRadius: '50px',
                                borderWidth: '0',
                                boxShadow: 'rgba(0, 0, 0, 0.15) 0px 2px 8px',
                                color: '#008000',
                                cursor: 'pointer',
                                display: 'inline-block',
                                fontFamily: 'Arial, Helvetica, sans-serif',
                                fontSize: '1em',
                                height: '50px',
                                padding: '0 25px',
                            } }, "Call"),
                        react_1.default.createElement("input", { className: '', type: 'text', id: 'receiverName', style: {
                                marginLeft: '2%'
                            } })))))));
};
exports.default = VideoCall;
