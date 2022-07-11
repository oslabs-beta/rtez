import React from 'react';
import { LOGIN, ICECANDIDATE, OFFER, ANSWER } from './actions.js';


const Socket = ({ ws, getUsers, handleReceiveCall, handleAnswer, handleNewIceCandidateMsg }) => {

    //potentially use immediately invoked function expression
    const initalizeConnection = () => {

        ws.addEventListener('open', () => {
            console.log('Websocket connection has opened.');
        })

        ws.addEventListener('close', () => {
            console.log('Websocket connection closed.');
        })

        ws.addEventListener('error', (e) => {
            console.error('Socket Error:', error)
        })

        ws.addEventListener('message', message => {
            const parsedData = JSON.parse(message.data);

            switch (parsedData.ACTION_TYPE) {
                case LOGIN: 
                    getUsers(parsedData);
                    break;
                case OFFER:
                    handleReceiveCall(parsedData);
                    break;
                case ANSWER:
                    handleAnswer(parsedData);
                    break;
                case ICECANDIDATE:
                    handleNewIceCandidateMsg(parsedData);
                    break;
                default:
                    console.error('error', parsedData);
                    break;
            }
        });
    }

    initalizeConnection();

    return (
        <>
        </>
    )
}

export default Socket;