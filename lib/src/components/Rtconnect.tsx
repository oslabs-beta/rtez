/* eslint-disable @typescript-eslint/no-non-null-assertion */

import React, { useState, useRef, useEffect } from 'react';
import Socket from './Socket';
import VideoComponent from './VideoComponent';
import actions from '../constants/actions';
const { LOGIN, ICECANDIDATE, OFFER, ANSWER, LEAVE } = actions;

// Defining interfaces for payloads that will be sent to other socket connections via websockets.
  // These interfaces describe the different events for the websocket message event to filter
interface payloadObj {
  ACTION_TYPE: string, 
  sender?: string,
  receiver?: string
}

interface loginPayObj extends payloadObj {
  payload: string
}

interface offerPayObj extends payloadObj {
  payload: RTCSessionDescription | null | undefined
}

/**
 * @desc Wrapper component containing logic necessary for P2P connections using WebRTC (RTCPeerConnect API + MediaSession API) and Websockets. 
 * Any client can call another thus not all functions are invoked for every user.
 * ws.current.send enqueues the specified messages that need to be transmitted to the server over the WebSocket connection, which we connected in our backend using RTConnect's importable  SignalingChannel
 * @param {string} this.props.URL 
 * @returns A component that renders two VideoComponents (currently not dynamic), a
 */
const Rtconnect = ({ URL }: { URL: string }): JSX.Element => {
  //username will store a name the client enters and users (see getUsers) will be updated whenever a user logs in or leaves
  const [username, setUsername] = useState<string>('');
  const [users, setUsers] = useState<JSX.Element[]>();

  // useRef allows our variables to be stored in Immutable Objects and do not force page re-renders when its value is changed
  // The Websocket connection is made later in useEffect once the component mounts then we render <Socket>, an empty component but adds event listeners to the socket
  const ws = useRef<WebSocket>(null!);
  const localVideo = useRef<HTMLVideoElement>(null!);
  const remoteVideo = useRef<HTMLVideoElement>(null!);
  const peerRef = useRef<RTCPeerConnection>(null!); 
  const otherUser = useRef<string>(); 
  const localStream = useRef<MediaStream>(null!);
  const senders = useRef<RTCRtpSender[]>([]);

  //maybe try to use context/reference hooks here for html input elements
  let userField = '';
  let receiver: string | null = '';

  // this configuration defines the parameters for how an RTCPeerConnection should be created, also ice trickling is enabled with iceCandidatePoolSize set to a value
    // stun servers are used to identify users so that peers can connect to eachother directly without the use of a middleman server (which would create latency)
    //'stun:stun2.l.google.com:19302', an additional ice server
  const configuration: RTCConfiguration = {
    iceServers: [
      {
        urls: 'stun:stun1.l.google.com:19302',
      },
    ],
    iceCandidatePoolSize: 10,
  };

  // These constraints will be used for our webcam video stream quality
  const constraints: MediaStreamConstraints = {
    video: {
      width: { min:640, ideal:1920, max:1920 },
      height: { min:480, ideal:1080, max:1080 },
    },
    audio: true
  };
  
  // a new one-time websocket connection is made on component mount and a permissions request for the client's video and audio is made
  useEffect(() => {
    ws.current = new WebSocket(`ws://${URL}`);
    openUserMedia();
  },[]);

  /**
   * A diagram of the WebRTC Connection logic
   * Peer A  Stun    Signaling Channel(Websockets)  Peer B   Step
   *  |------>|                   |                   |       Who Am I? + RTCPeerConnection(configuration) this contains methods to connect to a remote Peer
   *  |<------|                   |                   |       Symmetric NAT (your ip that you can be connected to)
   *  |-------------------------->|------------------>|       Calling Peer B, Offer SDP is generated and sent over websockets
   *  |-------------------------->|------------------>|       ICE Candidates are also being trickled in, where and what IP:PORT can Peer B connect to Peer A
   *  |       |<------------------|-------------------|       Who Am I? PeerB this time!
   *  |<--------------------------|-------------------|       Accepting Peer A's call, sending Answer SDP
   *  |<--------------------------|-------------------|       Peer B's ICE Candidates are now being trickled in to peer A for connectivity.
   *  |-------------------------->|------------------>|       ICE Candidates from Peer A, these steps repeat and are only necessary if Peer B can't connect to the earlier candidates sent.
   *  |<--------------------------|-------------------|       ICE Candidate trickling from Peer B, could also take a second if there's a firewall to be circumvented.
   *  |       |                   |                   |       Connected! Peer to Peer connection is made and now both users are streaming data to eachother!
   * 
   * If Peer A starts a call their order of functions being invoked is... handleOffer --> callUser --> createPeer --> peerRef.current.negotiationNeeded event (handleNegotiationNeededEvent) --> send Offer SDP --> start ICE trickle, handleIceCandidateEvent --> ^receive Answer^ SDP --> handleIceCandidateMsg --> once connected, handleTrackEvent
   * If Peer B receives a call then we invoke... Receive Offer SDP --> handleReceiveCall --> createPeer --> ^send Answer SDP^ --> handleIceCandidateMsg --> handleIceCandidateEvent --> once connected, handleTrackEvent
   * 
   * Note: Media is attached to the Peer Connection and sent along with the offers/answers to describe what media each client has. (see RTCPeerConnection.addTrack() MDN)
   */

  /**
  * @desc An event triggered on a button click.
  * Once the client enters and submits a name in the username field, this name is set stored in the WebSocketServer along with the socket 
  * that sent the name to later send messages to the right client using this socket.
  */
  const handleUsername = (): void => {
    const loginPayload: loginPayObj = {
      ACTION_TYPE: LOGIN, 
      payload: userField,
    };

    ws.current.send(JSON.stringify(loginPayload));
    setUsername(userField);
  };

  /**
   * @desc When a name is entered and submitted into the input field, this starts the Offer-Answer Model exchange
   */
  const handleOffer = (): void => {
    const inputField:HTMLInputElement | null = document.querySelector('#receiverName');

    if (inputField) {
      receiver = inputField.value;
      inputField.value = '';
      otherUser.current = receiver;
      callUser(receiver);
    }
  };

  /**
  * @desc When data is received from the WebSocketServer, this function is invoked.
  * Based off of the users connected, each user is displayed in a div.
  * @param {Array<string>} parsedData
  * @returns Re-renders the page with the new User List
  */
  const getUsers = (parsedData: { payload: string[] }): void => {
    const userList = parsedData.payload.map((name: string, idx:number) => (
      <div key={idx}>{name}</div>
    ));

    setUsers(userList);
  };

  /**
  * @desc Asks for the client's permissions to open their webcam and microphone.
  */
  const openUserMedia = async (): Promise<void> => {
    try {
      if (localVideo.current){
        localStream.current = localVideo.current.srcObject = await navigator.mediaDevices.getUserMedia(constraints); 
      }
    } catch (error) {
      console.log('Error in openUserMedia: ', error);
    }
  };

  /**
  * @desc Constructs a new RTCPeerConnection object that also adds the local client's media tracks to this object.
  * @param userID
  */
  const callUser = (userID: string): void => {
    if (peerRef.current) {
      peerRef.current = createPeer(userID);
      localStream.current.getTracks().forEach((track) => senders.current.push(peerRef.current.addTrack(track, localStream.current)));
    }
  };

  /**
  * @desc Creates a new RTCPeerConnection object, which represents a WebRTC connection between the local device and a remote peer and adds event listeners to it
  * @param { string } userID
  * @returns { RTCPeerConnection } RTCPeerConnection object 
  * @see https://developer.mozilla.org/en-US/docs/Web/API/RTCPeerConnection/connectionstatechange_event and other events
  */
  const createPeer = (userID: string): RTCPeerConnection => {
    const peer:RTCPeerConnection = new RTCPeerConnection(configuration);
    peer.onicecandidate = handleIceCandidateEvent;
    peer.ontrack = handleTrackEvent;
    peer.onnegotiationneeded = () => handleNegotiationNeededEvent(userID);

    console.log('registerPeerConnectionListners has activated');

    peer.addEventListener('negotiationneeded', () => {
      console.log('negotiationneeded event has fired');
    });

    peer.addEventListener('icegatheringstatechange', () => {
      console.log(`ICE gathering state changed: ${peerRef.current?.iceGatheringState}`);
    });
      
    peer.addEventListener('connectionstatechange', () => {
      console.log(`Connection state change: ${peerRef.current?.connectionState}`);
      console.log(peerRef.current);
    });
      
    peer.addEventListener('signalingstatechange', () => {
      console.log(`Signaling state change: ${peerRef.current?.signalingState}`);
    });
      
    peer.addEventListener('iceconnectionstatechange ', () => {
      console.log(`ICE connection state change: ${peerRef.current?.iceConnectionState}`);
    });

    return peer;
  };

  /**
  * @desc invokes WebRTC's built-in createOffer() function to create an SDP offer, which is an RTCSessionDescription object. This offer is then set as the local description using WebRTC's built-in setLocalDescription() function. Finally, the offer, sender and receiver is sent via ws.current.send to the Signaling Channel in the backend
  * @param {string} userID
  */
  function handleNegotiationNeededEvent(userID: string): void {
    peerRef.current
    ?.createOffer()
    .then((offer) => {
      return peerRef.current?.setLocalDescription(offer);
    })
    .then(() => {
      const offerPayload: offerPayObj = {
        ACTION_TYPE: OFFER,
        sender: username,
        receiver: userID,
        payload: peerRef.current?.localDescription
      };
      ws.current.send(JSON.stringify(offerPayload));
    })
    .catch(e => console.log(e));
  }

  /**
  * @desc When an offer is received from the SignalingChannel, this function is invoked, creating a new RTCPeerConnection with the local client's media attached and an Answer is created that is then sent back to the original caller through the websocket connection.
  * @param { RTCSessionDescriptionInit } data
  * @see https://developer.mozilla.org/en-US/docs/Web/API/RTCPeerConnection/createAnswer 
  */
  function handleReceiveCall(data: { sender: string, payload: RTCSessionDescriptionInit }): void {
    otherUser.current = data.sender;
    peerRef.current = createPeer(data.sender);
    const desc = new RTCSessionDescription(data.payload);
    peerRef.current.setRemoteDescription(desc)
    .then(() => {
      localStream.current?.getTracks().forEach((track) => peerRef.current?.addTrack(track, localStream.current));
    })
    .then(() => {
      return peerRef.current?.createAnswer();
    })
    .then(answer => {
      return peerRef.current?.setLocalDescription(answer);
    })
    .then(() => {
      const answerPayload = {
        ACTION_TYPE: ANSWER,
        receiver: data.sender,
        sender: username,
        payload: peerRef.current?.localDescription
      };
      ws.current.send(JSON.stringify(answerPayload));
    });
  }

  /**
  * @desc The local client's remote description is set as the incoming Answer SDP to define who we are trying to connect to on the other end of the connection.
  * @param {object} data SDP answer
  */
  function handleAnswer(data: { payload: RTCSessionDescriptionInit } ): void {
    const remoteDesc = new RTCSessionDescription(data.payload);
    peerRef.current
    ?.setRemoteDescription(remoteDesc)
    .catch((e) => console.log(e));
  }
  /**
  * @desc As ICE Candidates are being generated, these candidates are being sent to the remote client to complete the connection
  * @event e
  */
  function handleIceCandidateEvent(e: RTCPeerConnectionIceEvent) {
    if (e.candidate) {
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
  function handleNewIceCandidateMsg(data: { payload: RTCIceCandidateInit }): void {
    const candidate = new RTCIceCandidate(data.payload);

    peerRef.current
    ?.addIceCandidate(candidate)
    .catch((e) => console.log(e));
  }
  
  /**
  * @desc 
  * @param {RTCTrackEvent} e An Event Object, also contains the streams from the 
  */
  function handleTrackEvent(e: RTCTrackEvent) : void{
    remoteVideo.current.srcObject = e.streams[0];
  }
  /**
  * @desc 
  */
  function shareScreen(): void {
    //TODOS: Rtconnect.jsx:273 Uncaught (in promise) DOMException: The peer connection is closed.
        
    navigator.mediaDevices.getDisplayMedia().then(stream => {
      console.log('shareScreen stream', stream);
      const screenTrack = stream.getTracks()[0];
      senders.current?.find(sender => sender.track?.kind === 'video')?.replaceTrack(screenTrack);
      screenTrack.onended = function() {
        senders.current?.find(sender => sender.track?.kind === 'video')?.replaceTrack(localStream.current.getTracks()[1]);
      };
    });
  }
  /**
  * @desc if any client chooses to end their call then the person who ends the call first closes their connection and resets the remote video component while also sending a message to the remote peer to also go through the same process.
  * @param { boolean } isEnded 
  */
  function endCall(isEnded: boolean): void {
    const LeavePayload = {
      ACTION_TYPE: LEAVE,
      receiver: otherUser.current,
    };
    peerRef.current?.close();
    isEnded ? peerRef.current?.close() : ws.current?.send(JSON.stringify(LeavePayload));
    remoteVideo.current.srcObject = null;
  }

  return(
    <>
      {users}

      <div style={{display: 'flex', flexDirection:'column', top: '20%', left: '28%', margin: '0 auto', marginTop:'10%', height: '500px', width: '600px', borderStyle: 'solid', borderRadius: '25px', justifyContent: 'center', alignItems: 'center'}}>  
        <input 
          type='text' 
          placeholder='username' 
          id="username-field" 
          onChange={(e) => userField = e.target.value}
          style={{paddingBottom:'70px', width:'200px'}}
        ></input>
                
        <button 
          onClick={() => handleUsername()}
        >Submit Username</button>
      </div>

      {ws.current ?
        <Socket 
          ws={ws.current}
          getUsers={getUsers}
          handleReceiveCall={handleReceiveCall} 
          handleAnswer={handleAnswer} 
          handleNewIceCandidateMsg={handleNewIceCandidateMsg}
          endCall={endCall}
        /> 
        : ''}
      {/* 'conditionally rendering' if websocket has a value otherwise on page re-rendering events multiple websocket connections will be made and error 
          every user when one closes their browser */}

      <div style={{display: 'flex', justifyContent: 'space-around', border: '1px solid black', flexDirection:'column', padding:'10px', marginTop: '10%'} }>
        <div id="main-video-container" style= {{display: 'flex', flexDirection: 'row', gap: '100px', justifyContent:'center', alignItems:'center'}}>
          <div id="local-video-container">
            <VideoComponent video={localVideo}/>
          </div>
          <div id="remote-video-container">
            <VideoComponent video={remoteVideo} />
          </div>
        </div>
      </div>
                
      <div id="button-container" style= {{display: 'flex', flexDirection: 'row', gap: '10px', justifyContent:'center', marginTop:'10px'}}>

        <button
          onClick={() => shareScreen()}
        >
          Share Screen
        </button>

        <button
          onClick={() => endCall(false)}
        >
          End Call
        </button> 
                    
        <button 
          onClick={handleOffer} 
          style={{marginBottom:'25px', marginLeft:'400px', width: '200px'}}
        >
          Call
        </button>
                
        <input type='text' id='receiverName'style={{marginBottom:'3px'}}></input>
      </div>
    </>
  );
};

export default Rtconnect;
