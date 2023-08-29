import "./reset.css";
import "./App.css";
import {useEffect, useRef, useState} from "react";
import {v4 as uuidV4} from "uuid";
import {QRCodeSVG} from "qrcode.react";
import Peer from "peerjs";
import ToggleButton from "./ToggleButton";

const queryParams = new Proxy(new URLSearchParams(window.location.search), {
  get: (searchParams, prop) => searchParams.get(prop),
});

const baseUrl = window.location.href.split(/[?#]/)[0];
const sessionId = queryParams.session || uuidV4();
const participantId = queryParams.session
  ? queryParams.participant || uuidV4()
  : "0";
const isHost = participantId === "0";

window.history.replaceState(
  {sessionId, participantId},
  "B2B Clock",
  `${baseUrl}?session=${sessionId}&participant=${participantId}`
);

const ownId = `b2b-${sessionId}-${participantId}`;
const hostId = `b2b-${sessionId}-0`;

const createPeer = (sessionId, participantId, callback = () => {
}) => {
  //let peer = new Peer(ownId, {host: '172.20.10.2', port: 9000, path: '/peer'});
  let peer = new Peer(ownId) // , {host: '172.20.10.2', port: 9000, path: '/peer'});
  peer.on("open", (ID) => {
    console.log("My peer ID is: " + ID);
    callback(peer);
  });
  return peer;
};

const formatTime = (seconds) => (seconds ? new Date(seconds * 1000).toISOString().substr(11, 8) : 0)

function App() {
  const settings = JSON.parse(window.localStorage.getItem(sessionId)) || {};
  const [updating, setUpdating] = useState(false);
  const [name, setName] = useState(
    JSON.parse(window.localStorage.getItem(sessionId))?.name || ""
  );
  const [isNameSet, setIsNameSet] = useState(name !== "");
  const [currentState, setCurrentState] = useState("play");
  const selectTab = (tab) => {
    setCurrentState(tab);
    const settings = JSON.parse(window.localStorage.getItem(sessionId)) || {};
    window.localStorage.setItem(
      sessionId,
      JSON.stringify({...settings, tab})
    );
  };
  const [currentDate, setCurrentDate] = useState(new Date());

  const connectionsRef = useRef([{id: hostId, name}]);
  const [connections, _setConnections] = useState(connectionsRef.current);
  const nextConnectionNumberRef = useRef(1);
  const [nextConnectionNumber, _setNextConnectionNumber] = useState(
    nextConnectionNumberRef.current
  );

  // TODO: use ref
  const participatingRef = useRef()
  const [participating, _setParticipating] = useState(true)

  const setParticipating = (state) => {
    participatingRef.current = state
    _setParticipating(state)
  }

  const currentParticipantRef = useRef();
  const [currentParticipant, _setCurrentParticipant] = useState(
    currentParticipantRef.current
  );

  const setCurrentParticipant = (participantId) => {
    currentParticipantRef.current = participantId;
    _setCurrentParticipant(participantId);
  };

  // TODO: store participating here instead of in the connections
  const participantTimesRef = useRef(isHost && name !== "" ? [{
    participant: {id: hostId, name}, time: 0, participating: true
  }] : []);
  const [participantTimes, _setParticipantTimes] = useState(
    participantTimesRef.current
  );

  const setParticipantTimes = (times) => {
    participantTimesRef.current = times;
    _setParticipantTimes(times);
  };

  const switchStartedTimeRef = useRef();
  const [switchStartedTime, _setSwitchStartedTime] = useState(
    switchStartedTimeRef.current
  );

  const setSwitchStartedTime = (time) => {
    switchStartedTimeRef.current = time;
    _setSwitchStartedTime(time);
  };


  const setConnections = (newConnections) => {
    connectionsRef.current = newConnections;
    _setConnections(newConnections);
  };

  const setNextConnectionNumber = (nextConnectionNumber) => {
    nextConnectionNumberRef.current = nextConnectionNumber;
    _setNextConnectionNumber(nextConnectionNumber);
  };

  const peerRef = useRef(null);

  const mergeConnection = (connection, connections) => {
    let newConnections = connections.slice();
    const index = newConnections.findIndex(({id}) => id === connection.id);
    newConnections.splice(index !== -1 ? index : newConnections.length, 1, {
      ...newConnections[index],
      ...connection,
    });
    return newConnections;
  };

  // HOST

  const sendMessageToAllConnections = async (message) => {
    for (const connection of connectionsRef.current.slice(1)) {
      try {
        connection.connection.send(JSON.stringify(message));
      } catch (e) {
        console.error(e, connection);
      }
    }
  };

  const sendStatus = async () => {
    await sendMessageToAllConnections({
      type: "status",
      data: {
        currentParticipant: currentParticipantRef.current,
        participantTimes: participantTimesRef.current,
        switchStartedTime: switchStartedTimeRef.current
      },
    });
  };

  const getParticipantTimeById = participantId => participantTimesRef.current.find(({participant: {id}}) => id === participantId)

  const setSwitchCompleted = () => {
    const timeElapsed = (new Date() - switchStartedTimeRef.current) / 1000
    const participantId = currentParticipantRef.current.id
    console.log({participantId, participantTimes})
    let newTimes = participantTimesRef.current.slice()
    const currentParticipantTime = getParticipantTimeById(participantId)
    currentParticipantTime.time = currentParticipantTime.time + timeElapsed
    newTimes.sort((a, b) => a.participating === b.participating ? a.time - b.time : a.participating ? -1 : 1)
    setParticipantTimes(newTimes)
    startNextSwitch()
  }

  const startNextSwitch = () => {
    setSwitchStartedTime(new Date())
    let newTimes = participantTimesRef.current.slice()
    const nextParticipants = newTimes.filter(({participating}) => participating)
    const nextParticipantTime = nextParticipants[0].participant.id === currentParticipantRef.current?.id ? nextParticipants[1] : nextParticipants[0];
    setCurrentParticipant(nextParticipantTime.participant)
    // nextParticipantTime.time -= 60 // TODO: adjust
    setParticipantTimes(newTimes)
  }

  function addNewParticipantTime(participantId, name) {
    const newTimes = participantTimesRef.current.filter(({participant: {id}}) => id !== participantId)
    newTimes.push({
      participant: {id: participantId, name: name}, time: 0, participating: true
    })
    setParticipantTimes(newTimes)
  }

  const handleConnection = (connection) => { // HOST
    const connectionId = connection.peer;
    const newConnections = mergeConnection(
      {id: connectionId, connection, name: ""},
      connectionsRef.current // does this need to be ref current?
    );
    setConnections(newConnections);
    setNextConnectionNumber(nextConnectionNumberRef.current + 1);

    connection.on(
      "data",
      (async (connectionId, data) => {
        const json = JSON.parse(data);
        if (json.type === "init") {
          console.log('init')
          await sendStatus();
        } else if (json.type === "name") {
          const connection = connections.find(({id}) => connectionId)
          setConnections(
            mergeConnection(
              {
                ...connection,
                name: json.data,
              },
              connectionsRef.current
            )
          );
          addNewParticipantTime(connectionId, json.data);
          await sendStatus()
        } else if (json.type === "switchCompleted") {
          await setSwitchCompleted();
          await sendStatus()
        } else if (json.type === "participating") {
          let newTimes = participantTimesRef.current.slice()
          const participantIndex = newTimes.findIndex(({participant: {id}}) => id === connectionId)
          newTimes[participantIndex].participating = json.data
          setParticipantTimes(newTimes)
          await sendStatus()
        }
      }).bind(null, connectionId)
    );
  };

  // CLIENT

  const hostConnectionRef = useRef();

  function sendToHost(message) {
    hostConnectionRef.current.send(
      JSON.stringify(message)
    );
  };

  const switchCompleted = async () => {
    if (isHost) {
      setSwitchCompleted()
      await sendStatus()
    } else {
      sendToHost({
        type: "switchCompleted",
        data: {
          participantId
        }
      })
    }
  }

  const start = async () => { // HOST
    startNextSwitch()
    await sendStatus();
  }

  const handleOpen = () => { // CLIENT
    hostConnectionRef.current.send(JSON.stringify({type: "init"}));
    sendName();
    hostConnectionRef.current.on("data", (data) => {
      const json = JSON.parse(data);
      console.log(json)
      if (json.type === "status") {
        setCurrentParticipant(json.data.currentParticipant);
        setSwitchStartedTime(new Date(json.data.switchStartedTime))
        setParticipantTimes(json.data.participantTimes)
      }
    });
  };

  useEffect(() => {
    createPeer(
      sessionId,
      participantId,
      (peer) => {
        peerRef.current = peer;
        if (isHost) {
          peer.on("connection", handleConnection);
        } else {
          const connection = peer.connect(hostId);
          hostConnectionRef.current = connection;
          connection.on("open", handleOpen);
        }
      },
      []
    );

    return () => {
      // p.current?.close();
    };
  }, []);

  const sendName = () => {
    hostConnectionRef.current.send(JSON.stringify({type: "name", data: name}));
  };

  const updateName = async (name) => {
    if (isHost) {
      const newConnections = mergeConnection(
        {
          id: hostId,
          name,
        },
        connectionsRef.current // does this need to be ref current?
      );
      setConnections(newConnections);
      addNewParticipantTime(participantId, name)
      await sendStatus();
    } else {
      sendName();
    }
  };

  useEffect(() => {
    const intervalId = setInterval(() => {
      setCurrentDate(new Date());
    }, 100)
    return () => clearInterval(intervalId);
  }, [])

  const joinSessionLink = `${baseUrl}?session=${sessionId}`;
  const isCurrentParticipant = currentParticipant?.id === ownId

  return (
    <div className="App"
         style={{position: 'fixed', bottom: 0, left: 0, right: 0, top: 0, display: 'flex', flexDirection: 'column'}}>
      {!isNameSet ? (
        <div style={{flexGrow: 1, display: 'flex'}}>
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              margin: "auto",
              width: "20em",
              backgroundColor: "#fff5",
              padding: "1em",
              border: '1px solid white'
            }}
          >
            <h2 style={{marginTop: 0}}>Set your name to begin</h2>
            <label>
              You can call me{" "}
              <input
                style={{width: '8em'}}
                name={"name"}
                onChange={(e) => setName(e.target.value)}
                value={name}
              />
            </label>
            <br/>
            <button
              style={{background: '#fff4', padding: '1em'}}
              disabled={name === ""}
              onClick={async () => {
                setIsNameSet(true);
                const settings =
                  JSON.parse(window.localStorage.getItem(sessionId)) || {};
                window.localStorage.setItem(
                  sessionId,
                  JSON.stringify({...settings, name})
                );
                await updateName(name);
              }}
            >
              Let's begin!
            </button>
          </div>
        </div>
      ) : (
        currentState === "settings" ? (
            <div className={"container"} style={{display: 'flex', flexDirection: 'row'}}>
              <div className={'box'} style={{
                display: 'flex',
                flexDirection: 'column',
                flexGrow: 1,
                padding: '1em',
                borderLeft: '1px solid black',
                alignItems: 'center',
                justifyContent: 'center'
              }}>
                <>
                  <span style={{padding: '1em'}}>Invite participants</span>
                  <QRCodeSVG value={joinSessionLink}/>
                  <a href={joinSessionLink}>link</a>
                </>
              </div>
            </div>
          ) :
          <div className={"container"} style={{display: 'flex', flexDirection: 'row'}}>
            <div className={"box"} style={{
              flex: 2,
              borderLeft: '1px solid black',
              display: 'flex',
              flexDirection: 'column',
              height: '100vh'
            }}>
              <div className={"box"} style={{
                flex: 5,
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'center',
                alignItems: 'center'
              }}>
                {currentParticipant?.id === undefined ? isHost ?
                  <button style={{
                    bottom: '2em',
                    border: '2px solid white',
                    color: 'white',
                    fontWeight: 'bold',
                    padding: '1em',
                    margin: '2em',
                    background: '#fff5'
                  }}
                          onClick={start}>
                    Start
                  </button> : "Waiting for the host to start the session" : <>
                  <span style={{fontSize: '150%'}}>Up now: {currentParticipant?.name}</span>
                  <span style={{fontSize: '300%'}}>{
                    formatTime(Math.max(0, getParticipantTimeById(currentParticipant?.id)?.time + ((currentDate - switchStartedTime) / 1000)))
                  }</span>
                  {isCurrentParticipant &&
                    <button style={{
                      bottom: '2em',
                      border: '2px solid white',
                      color: 'white',
                      fontWeight: 'bold',
                      padding: '1em',
                      margin: '2em',
                      background: '#fff5'
                    }}
                            disabled={updating} onClick={switchCompleted}>
                      Switch
                    </button>}
                </>}
                <div style={{
                  position: 'absolute',
                  bottom: 0,
                  display: 'flex',
                  alignItems: 'center',
                  padding: 10,
                  width: '100%',
                  justifyContent: 'center',
                  fontSize: '150%',
                  background: 'black',
                  height: '3em'
                }}>
                  <div style={{
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center'
                  }}>
                    <ToggleButton checked={participating} onChange={async (checked) => {
                      setParticipating(!participating)
                      if (isHost) {
                        let newTimes = participantTimesRef.current.slice()
                        newTimes[0].participating = checked
                        setParticipantTimes(newTimes)
                        await sendStatus()
                      } else {
                        sendToHost({
                          type: "participating",
                          data: checked
                        })
                      }
                    }} id='participateButton'/>
                    <label htmlFor='participateButton' className="noselect">
                      {participating ? 'Participating' : 'Not participating'}
                    </label>
                  </div>
                </div>
              </div>
              <div
                style={{paddingBottom: '1em', borderBottom: '1px solid black', padding: '1em', fontWeight: 'bold'}}>Up
                next
              </div>
              <div style={{overflowY: 'hidden', flexGrow: 1, marginBottom: '8em'}}>
                <table style={{padding: '1em', width: '100%'}} className={"box"}>
                  <tbody>
                  {
                    participantTimes.filter(({participant: id}) => id !== currentParticipant?.id)
                      .map(({
                              participant,
                              participating,
                              time
                            }) =>
                        <tr>
                          <td className={"next-up"}><span
                            style={{opacity: !participating ? 0.5 : 1}}>{formatTime(time)}</span> {!participating &&
                            <span className='pill'>Skip</span>}</td>
                          <td style={{display: 'flex', alignItems: 'center'}}>{participant.name}</td>
                        </tr>
                      )
                  }
                  </tbody>
                </table>
              </div>
            </div>
          </div>
      )}
      <div className={"nav"}>
        <div
          className={`nav-item clickable`}
          onClick={() => selectTab(currentState === "settings" ? "play" : "settings")}
        >
          ⚙
        </div>
      </div>
    </div>
  )
    ;
}

export default App;
