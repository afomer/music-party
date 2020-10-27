/** @fileoverview Set the UI and event listeners */


// Global Variables

const DEFAULT_PIC = 'https://upload.wikimedia.org/wikipedia/en/e/e6/AllAmerikkkanBadass.jpg'
const UNCONNECTED_HOST_TEXT = "Start a Party 🎉"
const CONNECTED_HOST_TEXT = "Close the Party"
const UNCONNECTED_LISTENER_TEXT = "Join a Party 🎉"
const CONNECTED_LISTENER_TEXT = "Leave the Party"
const $room = document.getElementById('room-join')
const $room_create = document.getElementById('room-create')
const $slider = document.getElementById('slider')
const $volume_range = document.getElementById('volume-range')
const $audio_player = document.getElementById('audio-player')
let remoteStream = null
let isPlayerCreated = false
let PlayerSTATE = undefined

if ($slider) {
    $slider.value = 0
    $slider.step = 1
    $slider.min = 0
    $slider.max = 100
}


/*
*
* Main Function Call
*
*/

function main() {

    // A workaround to turn WebAudio on the browser, once the screen is touched/clicked
    document.addEventListener("touchstart", addPlayerInit)
    document.addEventListener("click", addPlayerInit)

    // Update the slider bar, the time elapsed, and the time remaining
    document.addEventListener("SEEK_TIME_UPDATE", updateTimeProgressUI)

    // Visually update the slider immedietly when its value changes
    if ($slider) {
        $slider.addEventListener('input', updateSlider)
        // Once the change happens (through seeking or programmatically), update the logic
        $slider.addEventListener('change', onSliderSeek)
    }

    if ($volume_range) {
        $volume_range.addEventListener('input', updateSlider)
        $volume_range.addEventListener('change', onVolumeChange)
        activateVolumeSlider()
    }



    // Make the Add Song, and Play buttons functional
    activateAddSongButton()
    activatePlayButton()
    handlePartySession()
}

main()

/***/

function addPlayerInit() {
    // Create a player object once you get a touch
    PlayerSTATE = PlayerSTATE || new PlayerFSM()

    // Once the player is created remove the listener
    // For Only-once runtime of the function/creation of Player
    document.removeEventListener("touchstart", addPlayerInit)
    document.removeEventListener("click", addPlayerInit)
    console.log('removeEventListener')

    const numberOfChannels = 1
    const length = 1
    const sampleRate = 22050
    var buffer = PlayerSTATE.audioContext.createBuffer(numberOfChannels, length, sampleRate)
    var source  = PlayerSTATE.audioContext.createBufferSource()
    source.buffer = buffer
    source.connect(PlayerSTATE.audioContext.destination)
    source.start()

    // Unlock HTML5 Audio - load a data url of short silence and play it
    // This will allow us to play web audio when the mute toggle is on
    var silenceDataURL = "data:audio/mp3;base64,//MkxAAHiAICWABElBeKPL/RANb2w+yiT1g/gTok//lP/W/l3h8QO/OCdCqCW2Cw//MkxAQHkAIWUAhEmAQXWUOFW2dxPu//9mr60ElY5sseQ+xxesmHKtZr7bsqqX2L//MkxAgFwAYiQAhEAC2hq22d3///9FTV6tA36JdgBJoOGgc+7qvqej5Zu7/7uI9l//MkxBQHAAYi8AhEAO193vt9KGOq+6qcT7hhfN5FTInmwk8RkqKImTM55pRQHQSq//MkxBsGkgoIAABHhTACIJLf99nVI///yuW1uBqWfEu7CgNPWGpUadBmZ////4sL//MkxCMHMAH9iABEmAsKioqKigsLCwtVTEFNRTMuOTkuNVVVVVVVVVVVVVVVVVVV//MkxCkECAUYCAAAAFVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVV";
    tag = document.createElement("audio");
    tag.controls = false;
    tag.preload = "auto";
    tag.loop = false;
    tag.src = silenceDataURL;
    tag.onended = function()
    {
        console.log("HTMLAudio unlocked!");
    };
    var p = tag.play();
}

function updateTimeProgressUI(event) {
    const currentSeekTime = event.detail.currentSeekTime / 1000
    const duration        = event.detail.duration / 1000

    const currentTimeMinutes = `${(currentSeekTime / 60).toFixed(0)}`
    const currentTimeSeconds = `${(currentSeekTime % 60).toFixed(0)}`

    const timeLeft    = duration - currentSeekTime
    const timeLeftMinutes = `${(timeLeft / 60).toFixed(0)}`
    const timeLeftSeconds = `${(timeLeft % 60).toFixed(0)}`

    document.getElementsByClassName('time_elapsed')[0].datetime  = `PT${currentTimeMinutes}M${currentTimeSeconds}S`
    document.getElementsByClassName('time_elapsed')[0].innerHTML =`${currentTimeMinutes}:${currentTimeSeconds.padStart(2, "0")}`
    document.getElementsByClassName('time_remaining')[0].datetime = `PT$${timeLeftMinutes}M${timeLeftSeconds}S`
    document.getElementsByClassName('time_remaining')[0].innerHTML = `-${timeLeftMinutes}:${timeLeftSeconds.padStart(2, "0")}`

    // Trigger 'input' event so listener, can handle it
    $slider.value = Math.floor((currentSeekTime/duration) * $slider.max)
    $slider.setAttribute("value", Math.floor((currentSeekTime/duration) * $slider.max))

    const eventInput = new Event('input', {
                        bubbles: true,
                        cancelable: true
                    })

    $slider.dispatchEvent(eventInput)
}



function bytesArrToBase64(arr) {
    const abc = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/"; // base64 alphabet
    const bin = n => n.toString(2).padStart(8,0); // convert num to 8-bit binary string
    const l = arr.length
    let result = '';

    for(let i=0; i<=(l-1)/3; i++) {
        let c1 = i*3+1>=l; // case when "=" is on end
        let c2 = i*3+2>=l; // case when "=" is on end
        let chunk = bin(arr[3*i]) + bin(c1? 0:arr[3*i+1]) + bin(c2? 0:arr[3*i+2]);
        let r = chunk.match(/.{1,6}/g).map((x,j)=> j==3&&c2 ? '=' :(j==2&&c1 ? '=':abc[+('0b'+x)]));
        result += r.join('');
    }

    return result;
}

async function getAudioFileDuration(file) {
    /* Getting audio duration */
    const $tmpAudio = document.createElement('audio')
    $tmpAudio.setAttribute('preload', 'metadata')

    return new Promise((resolve, reject) => {

        $tmpAudio.onloadedmetadata = () => {
            resolve(Math.floor($tmpAudio.duration))
        }

        $tmpAudio.src = URL.createObjectURL(file)
    })

}

async function getMetadata(file) {
    return new Promise((resolve, reject) => {
        jsmediatags.read(file, {
            'onSuccess': ({ tags }) => resolve(tags),
            'onFailure': (error) => reject(error)
        })
    })
}

// A template for song card
function songElementFn(title, artist, duration) {
    return (`
    <div class="song-card">
        <div style="align-self: center; border-radius: 50%;width: 65px; height: 65px; margin-right: 10px; overflow: hidden;">
            <img style="height: 100%; width: 100%;"/>
        </div>
        <div style="padding: 10px 0px;display: flex; flex: 1; justify-content: space-between; align-items: center; overflow: hidden">

            <div style="width: 90%">
                <div style="font-size: 1.2em; text-overflow: ellipsis; overflow: hidden; white-space: nowrap;font-family: Gill Sans, Seravek, Trebuchet MS, sans-serif;">
                    ${title}
                </div>

                <div style="color: rgba(255,255,255,0.45); font-size: 0.8em;font-weight: 100;font-family: Gill Sans, Seravek, Trebuchet MS, sans-serif;">
                    ${artist}
                </div>
            </div>

            <div style="width: 10%;font-weight: 100;font-size: 0.8em;display: flex; flex-direction: column; justify-content: center; margin: 0px 6px 0 4px; text-align: right;font-family: Gill Sans, Seravek, Trebuchet MS, sans-serif;">
                ${duration}
            </div>

        </div>
    </div>`)
}


async function handleAudioFile(file) {

    const tags     = await getMetadata(file)
    const title    = tags['title'] || file['name']
    const duration = await getAudioFileDuration(file)

    const img    = (tags['picture'] && tags['picture']['data']) ?  "data:image/png;base64," + bytesArrToBase64(tags['picture']['data']) : DEFAULT_PIC
    const artist = tags['artist']
    const album  = tags['album']
    const songObject = new Song(file, title, duration, artist, img)

    const songIdx = PlayerSTATE.addSongToPlaylist(songObject)

    const durationFormatted = `${(duration / 60).toFixed(0)}:${(duration % 60).toFixed(0).padStart(2, "0")}`
    const albumFormatted  = (album && `• ${album}`) || ''
    const artistFormatted = artist && (`${artist} ${albumFormatted}`) || ''

    /* Create Song Card */
    const div = document.createElement('div')
    div.innerHTML = songElementFn(title, artistFormatted, durationFormatted).trim()
    const songCard = div.firstChild
    songCard.getElementsByTagName('img')[0].src = img

    songCard.onclick = () => {
        document.getElementById('song-img').src = img
        document.getElementById('song-title').textContent  = title
        document.getElementById('song-artist').textContent = artistFormatted

        PlayerSTATE.play(songIdx)
        .then(() => PlayerSTATE.currentSong.getArrayBufferFromFile())

        // Add duration to audio tag
        $audio_player.setAttribute("duration", duration)
    }

    // Add the song to UI
    document.getElementById('playlist').appendChild(songCard)
}

function activateAddSongButton() {
    const inputFileElement = document.createElement('input')
    if (document.getElementById('add-song')) {
        document.getElementById('add-song').onclick = () => {
            inputFileElement.setAttribute('multiple', '')
            inputFileElement.setAttribute('type', 'file')
            inputFileElement.click()
        }
    }

    inputFileElement.oninput = (e) => {
        // Add all selected files to the array list
        for (const file of e.target.files) {
            if (file.type.match("audio*")) {
                handleAudioFile(file)
            } else {
                alert(`File ${file.name} is not an audio file`)
            }
        }
    }
}

/** Style for Pause and Play Buttons */
const pauseStyle = 'fas fa-pause fa-3x'
const playStyle  = 'fas fa-play fa-3x'

function changePlayButtonUI({ isPlaying, buttonStyle }) {

    if (!document.getElementById('play-button')) {
        return;
    }

    document.getElementById('play-button').setAttribute('playing', isPlaying)
    document.getElementById('play-button').firstElementChild.setAttribute('class', buttonStyle)
}

function playAudio() {
    changePlayButtonUI({ isPlaying: true, buttonStyle: playStyle })
    return PlayerSTATE.play()
}

function pauseAudio() {
    changePlayButtonUI({ isPlaying: false, buttonStyle: pauseStyle })
    return PlayerSTATE.pause() // Web Audio API has only play/stop
}

function activatePlayButton() {

    let playPromise = undefined

    if (document.getElementById('play-button')) {
        document.getElementById('play-button').onclick = (e) => {
            const isPlaying  = document.getElementById('play-button').getAttribute('playing') || false
            const togglePlayButton = isPlaying == "true" ? pauseAudio : playAudio

            if (playPromise !== undefined) {
                playPromise = playPromise.then(togglePlayButton)
            } else {
                playPromise = togglePlayButton()
            }
        }
    }

    document.addEventListener("PAUSE", (e) => {
        changePlayButtonUI({ isPlaying: false, buttonStyle: playStyle })
    })

    document.addEventListener("PLAY", (e) => {
        changePlayButtonUI({ isPlaying: true, buttonStyle: pauseStyle })
    })
}

// Take care of progressing the bar
function updateSlider(e) {
    const rangeMin = e.target.min
    const rangeMax = e.target.max
    const value = e.target.value
    e.target.style['background-size'] = `${((value - rangeMin) * 100 / (rangeMax - rangeMin))}% 100%`
}

function calculateSeekTimeFromSlider() {
    return ($slider.value/$slider.max)
}

function activateVolumeSlider() {
    // Set up initial value
    $volume_range.value = document.getElementById('audio-player').volume
    $volume_range.style['background-size'] = `${(($volume_range.value - $volume_range.min) * 100 / ($volume_range.max - $volume_range.min))}% 100%`

    // When slider change => change audio player volume
    document.getElementById('volume-range').oninput = (e) => {
        const $audio_player = document.getElementById('audio-player')
        const volumeRangeValue = e.target.value
        $audio_player.volume = volumeRangeValue
    }
}

function onSliderSeek() {
    updateSlider(e)
    PlayerSTATE.seek(calculateSeekTimeFromSlider())
}

function onVolumeChange(e) {
    updateSlider(e)
    if (PlayerSTATE) {
        const volumeValue = Number(e.target.value)
        PlayerSTATE.changeVolume(volumeValue)
    }
}

function onPartyStateChange() {

    // For Host
    if ($room_create) {
        if ($room_create && Party.CURRENT_STATE == Party.STATES.HOST){
            $room_create.className = 'button-style-leave'
            $room_create.textContent = CONNECTED_HOST_TEXT
            $room.style.visibility = 'hidden'
            document.getElementById('room-input-form').style.visibility = 'hidden'
        } else if ($room_create &&  Party.CURRENT_STATE == Party.STATES.IDLE) {
            $room_create.className = 'button-style'
            $room_create.textContent = UNCONNECTED_HOST_TEXT
            $room.style.visibility = 'visible'
            document.getElementById('room-input-form').style.visibility = 'visible'
        }
    } else {
        // For Listeners
        if ($room && Party.CURRENT_STATE == Party.STATES.LISTENER){
            $room.className = 'button-style-leave'
            $room.textContent = CONNECTED_LISTENER_TEXT
            document.getElementById("room-input").style.visibility = 'hidden'
        } else if ($room && Party.CURRENT_STATE == Party.STATES.IDLE) {
            $room.className = 'button-style'
            $room.textContent = UNCONNECTED_LISTENER_TEXT
            document.getElementById("room-input").style.visibility = 'visible'
        }
    }

}



function handlePartySession() {

    document.addEventListener(Party.EVENT_TYPES.STATE_CHANGE, (e) => {
        console.log({NEW_STATE: e.detail.STATE})
        onPartyStateChange()
    })

    // TODO: Add animation for the listener based on the waves amplitude of the audio
    document.getElementById("room-input-form").onsubmit = (e) => {
        if (Party.CURRENT_STATE == Party.STATES.IDLE) {
            const partyID = document.getElementById('room-input').value
            document.getElementById('room-input').value = ''
            Party.join(partyID)

        } else {
            Party.leave()
        }

        e.preventDefault()
        return false;
    }

    if ($room_create) {
        $room_create.onclick = async (e) => {
            if (Party.CURRENT_STATE == Party.STATES.IDLE) {
                const createdParty = await Party.create()
                if (createdParty) {
                    document.getElementById("party-title").textContent = `🎉 Party ID: ${Party.ID}`
                    $room_create.setAttribute("connectionID", Party.ID)
                    $room_create.setAttribute("state", "connected")
                    document.getElementById("peer-type").className = "highlight"
                    document.getElementById("peer-type").textContent = "Host"
                } else {
                    alert('Not connected to the Server')
                }
            } else {
                document.getElementById("party-title").textContent = `Music Party`
                $room_create.setAttribute("connectionID", Party.ID)
                $room_create.setAttribute("state", "unconnected")
                document.getElementById("peer-type").className = ""
                document.getElementById("peer-type").textContent = ""
                $room.className = "button-style-leave"

                await Party.leave()
            }
        }

    }
}


