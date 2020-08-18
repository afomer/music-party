let remoteStream = null
let isPlayerCreated = false
let PlayerObject    = null

const $slider = document.getElementById('slider')
const $audio_player = document.getElementById('audio-player')
$slider.value = 0
$slider.step = 1
$slider.min = 0
$slider.max = $slider.min
//TODO: The slider should affect the visual of <input type=range />
$slider.addEventListener('change', () => $audio_player.currentTime = $slider.value)

document.addEventListener("seekTimeUpdate", (event) => {
    console.log(event, event.duration, event.currentSeekTime)

    const { currentSeekTime, duration } = event.detail

    const currentTimeMinutes = `${(currentSeekTime / 60).toFixed(0)}`
    const currentTimeSeconds = `${(currentSeekTime % 60).toFixed(0)}`

    const timeLeft    = duration - currentSeekTime
    const timeLeftMinutes = `${(timeLeft / 60).toFixed(0)}`
    const timeLeftSeconds = `${(timeLeft % 60).toFixed(0)}`

    document.getElementsByClassName('time_elapsed')[0].datetime  = `PT${currentTimeMinutes}M${currentTimeSeconds}S`
    document.getElementsByClassName('time_elapsed')[0].innerHTML =`${currentTimeMinutes}:${currentTimeSeconds.padStart(2, "0")}s`
    document.getElementsByClassName('time_remaining')[0].datetime = `PT$${timeLeftMinutes}M${timeLeftSeconds}S`
    document.getElementsByClassName('time_remaining')[0].innerHTML = `-${timeLeftMinutes}:${timeLeftSeconds.padStart(2, "0")}s`

    // Trigger 'input' event so listener, can handle it
    $slider.value = currentSeekTime
    const eventInput = new Event('input', {
                        bubbles: true,
                        cancelable: true
                    })

    $slider.dispatchEvent(eventInput)
})



// Add songs in a list format
function songElementFn(title, artist, duration) {
    return (`
    <div class="song-card">
        <div style="border-radius: 50%;width: 65px; height: 65px; margin-right: 10px; overflow: hidden;">
            <img style="height: 100%; width: 100%;"/>
        </div>

        <div style="display: flex; flex: 1; justify-content: space-between; align-items: center; overflow: hidden">

            <div style="width: 95%">
                <div style="font-size: 1.2em; text-overflow: ellipsis; overflow: hidden; white-space: nowrap;font-family: Gill Sans, Seravek, Trebuchet MS, sans-serif;">
                    ${title}
                </div>

                <div style="color: rgba(255,255,255,0.45); font-size: 0.8em;font-weight: 100;font-family: Gill Sans, Seravek, Trebuchet MS, sans-serif;">
                    ${artist}
                </div>
            </div>

            <div style="width: 5%; margin-left: 4px; text-align: right; font-size: 0.8em;font-weight: 100;font-family: Gill Sans, Seravek, Trebuchet MS, sans-serif;">
                ${duration}
            </div>

        </div>

    </div>`)
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


class Song {

    constructor(file="", title="", duration="", artist="", img="") {
        this.file = file
        this.title = title
        this.duration = duration
        this.artist = artist
        this.img = img
    }

    getInfo() {
        return {
            file: this.file,
            title: this.title,
            duration: this.duration,
            artist: this.artist,
            img: this.img
        }
    }

    getArrayBufferFromFile() {

        return new Promise((resolve, reject) => {

            const reader = new FileReader()

            reader.onload = () => {
                resolve(reader.result)
            }

            reader.readAsArrayBuffer(this.file)
        })
    }

}

class Player {

    constructor() {
        this.playerPromiseChain = Promise.resolve()
        this.audioCtx = new AudioContext()
        this.bufferSource    = undefined
        this.duration        = undefined
        this.interval        = undefined
        this.currentSeekTime = undefined
        this.playlist = []
        this.queue = []
        this.destinations = []
    }

    addDestinationNode(destinationNode) {
        try {
            this.getBufferSource().connect(destinationNode)
            return true
        } catch(error) {
            console.error(error)
            return false
        }
    }

    // Play the i-th song from the playlist, by pushing it to the queue
    // then playing the top song from the queue
    async play(idx=undefined) {

        let playPlaylist = false
        let playQueue    = false

        // in case you want to play the queue (the idx has to be undefined/null)
        if (idx == undefined) {
            if (this.queue.length > 0) {
                playQueue = true
            }
            else {
                return false
            }
        }
        // in case you want to play from the playlist, [idx] has to be a valid index
        else if (0 <= idx && idx < this.playlist.length) {
            playPlaylist = true
        }

        if (!playPlaylist && !playQueue) {
            console.warn('No Song was played because the queue is empty or playlist ID is invalid')
            return false
        }

        if (playPlaylist) {
            this.addSongToQueue(idx)
        }

        //addAudioToStream($audio_player)


        const songID       = this.queue[0]
        const audioCtx     = this.getAudioContext()
        const bufferSource = this.getBufferSource()
        const audioArrayBuffer  = await this.playlist[songID].getArrayBufferFromFile()


        this.playerPromiseChain = this.playerPromiseChain
            .then(() => audioCtx.decodeAudioData(audioArrayBuffer))
            .then((audioBuffer) => {
                bufferSource.buffer = audioBuffer
                this.setDuration(audioBuffer.duration)
                this.setSeekTime(this.currentSeekTime || 0)
                console.log('seekTime: ', this.currentSeekTime/1000)
                bufferSource.start(0, this.currentSeekTime/1000)
                this.setSeekTimer()
                document.dispatchEvent(new CustomEvent("play", {bubbles: true}))
            })

        return this.playerPromiseChain
    }

    async stop() {

        this.playerPromiseChain = this.playerPromiseChain.then(() => {
            this.getBufferSource().stop()
            clearInterval(this.interval)
            this.resetSeekTime(undefined)
            this.bufferSource = undefined
            document.dispatchEvent(new CustomEvent("pause", {bubbles: true}))
        })

        return this.playerPromiseChain
    }

    async pause() {

        this.playerPromiseChain = this.playerPromiseChain.then(() => {
            this.getBufferSource().stop()
            clearInterval(this.interval)
            this.bufferSource = undefined
            document.dispatchEvent(new CustomEvent("pause", {bubbles: true}))
        })

        return this.playerPromiseChain
    }

    addSongToPlaylist(song) {

        if (!(song instanceof Song)) {
            throw Error(`The song is not a Song Class object,
                         please use the song object to play songs`)
        }

        try {
            this.playlist.push(song)
            return this.playlist.length - 1
        } catch (error) {
            console.error(error)
            return -1
        }

    }

    addSongToQueue(idx) {

        if (idx < 0 || idx >= this.playlist.length) {
            console.error('Invalid Song Playlist ID/Number')
            return false
        }

        try {
            this.queue.push(idx)
            return true
        } catch (error) {
            console.error(error)
            return false
        }

    }

    getPlaylist() {
        return this.playlist
    }

    getQueue() {
        return this.queue
    }

    getAudioContext() {
        return this.audioCtx
    }

    getBufferSource() {
        if (this.bufferSource == undefined) {
            this.bufferSource = this.audioCtx.createBufferSource()
            this.bufferSource.connect(this.audioCtx.destination)
        }

        return this.bufferSource
    }

    setDuration(duration) {
        this.duration = duration
    }

    resetSeekTime(seekTime) {
        this.currentSeekTime = undefined
    }

    setSeekTime(seekTime) {
        this.currentSeekTime = seekTime
        const event = new CustomEvent("seekTimeUpdate", {
            bubbles: true,
            detail: {
                currentSeekTime: this.currentSeekTime / 1000, // milliSeconds => Seconds
                duration: this.duration
            }
        })

        console.log(this.currentSeekTime, this.duration)
        document.dispatchEvent(event);
    }

    setSeekTimer(currentTime) {
        const intervalInMilliseconds = 500
        const duration               = this.duration * 1000
        this.interval = setInterval(() => {

          console.log('duration >>', duration, this.currentSeekTime)
          if (this.currentSeekTime + intervalInMilliseconds > duration ) {
                this.setSeekTime(duration)
            } else {
                this.setSeekTime(this.currentSeekTime + intervalInMilliseconds)
            }

        }, intervalInMilliseconds)
    }

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

const DEFAULT_PIC = 'https://upload.wikimedia.org/wikipedia/en/e/e6/AllAmerikkkanBadass.jpg'

async function getMetadata(file) {
    return new Promise((resolve, reject) => {
        jsmediatags.read(file, {
            'onSuccess': ({ tags }) => resolve(tags),
            'onFailure': (error) => reject(error)
        })
    })
}

async function handleAudioFile(file) {

    const tags = await getMetadata(file)

    const title  = tags['title'] || file['name']
    const duration = await getAudioFileDuration(file)
    console.log('dur', duration)

    const img    = tags['picture']?.['data'] ?  "data:image/png;base64," + bytesArrToBase64(tags['picture']?.['data']) : DEFAULT_PIC
    const artist = tags['artist']
    const album  = tags['album']
    const songObject = new Song(file, title, duration, artist, img)

    const songIdx = PlayerObject.addSongToPlaylist(songObject)

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
        PlayerObject.play(songIdx)
        // Add duration to audio tag
        $audio_player.getAttribute("duration", duration)
    }

    // Add the song to UI
    document.getElementById('playlist').appendChild(songCard)
}


function activateAddSongButton() {
    const inputFileElement = document.createElement('input')
    document.getElementById('add-song').onclick = () => {
        inputFileElement.setAttribute('multiple', '')
        inputFileElement.setAttribute('type', 'file')
        inputFileElement.click()

        if (!isPlayerCreated) {
            // connecting to speakers happens inside
            PlayerObject = new Player()
        }

    }

    inputFileElement.oninput = (e) => {
        // Add all selected files to the array list
        for (const file of e.target.files) {
            if (file.type.match("audio*")) {
                handleAudioFile(file)
            } else {
                // TODO: show a notification of not showing
            }
        }
    }
}

const pauseStyle = 'fas fa-pause fa-3x'
const playStyle  = 'fas fa-play fa-3x'

const changePlayButtonUI = ({ isPlaying, buttonStyle }) => {
    document.getElementById('play-button').setAttribute('playing', isPlaying)
    document.getElementById('play-button').firstElementChild.setAttribute('class', buttonStyle)
}

const playAudio = () => {
    changePlayButtonUI({ isPlaying: true, buttonStyle: playStyle })
    return PlayerObject.play()
}

const pauseAudio = () => {
    changePlayButtonUI({ isPlaying: false, buttonStyle: pauseStyle })
    return PlayerObject.pause()
}

function activatePlayButton() {

    let playPromise = undefined

    document.getElementById('play-button').onclick = (e) => {
        const isPlaying  = document.getElementById('play-button').getAttribute('playing') || false
        const togglePlayButton = isPlaying == "true" ? pauseAudio : playAudio

        if (playPromise !== undefined) {
            playPromise = playPromise.then(togglePlayButton)
        } else {
            playPromise = togglePlayButton()
        }

    }

    document.addEventListener("pause", (e) => {
        changePlayButtonUI({ isPlaying: false, buttonStyle: playStyle })
    })

    document.addEventListener("play", (e) => {
        changePlayButtonUI({ isPlaying: true, buttonStyle: pauseStyle })
    })
}

const activateVolumeSlider = () => {
    // Set up initial value
    $volume_range = document.getElementById('volume-range')
    console.log(document.getElementById('audio-player').volume)
    $volume_range.value = document.getElementById('audio-player').volume
    $volume_range.style['background-size'] = `${(($volume_range.value - $volume_range.min) * 100 / ($volume_range.max - $volume_range.min))}% 100%`

    // When slider change => change audio player volume
    document.getElementById('volume-range').oninput = (e) => {
        const $audio_player = document.getElementById('audio-player')
        const volumeRangeValue = e.target.value
        $audio_player.volume = volumeRangeValue
    }
}

/*
*
* Main Function Call
*
*/

// Make the Add Song, and the Play buttons functional
activateAddSongButton()
activatePlayButton()
activateVolumeSlider()
document.getElementById("room-input-form").onsubmit = joinAhost
document.getElementById('room-create').onclick = () => {
    if ( createRoom() ) {
        document.getElementById("party-title").textContent = `You're the host of Party: ${ID}`
    }
}
const unconnected_TEXT = "Start a Party 🎉"
const connected_TEXT = "Leave the Party"

$room_create = document.getElementById('room-create')

const observer = new MutationObserver(() => {
    console.log('state')
    const $room = document.getElementById('room-create')
    if ($room.getAttribute("state") == "connected"){
        $room.className = 'button-style-leave'
        $room.textContent = connected_TEXT
    } else if ($room.getAttribute("state") == "unconnected") {
        $room.className = 'button-style'
        $room.textContent = unconnected_TEXT
    }
})

observer.observe($room_create, {
    attributes: true,
    attributeFilter: ['state'],
    characterData: false
})

// Take care of progressing the bar
const updateSlider =  (e) => {
    const rangeMin = e.target.min
    const rangeMax = e.target.max
    const value = e.target.value
    e.target.style['background-size'] = `${((value - rangeMin) * 100 / (rangeMax - rangeMin))}% 100%`
}

for (const elem of document.querySelectorAll('input[type="range"]')) {
    elem.addEventListener('input', updateSlider)
    elem.addEventListener('change', updateSlider)
}
