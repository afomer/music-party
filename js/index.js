
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

function activateAddSongButton() {
    const inputFileElement = document.createElement('input')
    document.getElementById('add-song').onclick = () => {
        inputFileElement.setAttribute('multiple', '')
        inputFileElement.setAttribute('type', 'file')
        inputFileElement.click()
    }

    inputFileElement.oninput = (e) => {

        // Add all selected files to the array list
        for (const file of e.target.files) {

            /* */
            jsmediatags.read(file, {
                'onSuccess': async ({ tags }) => {

                    /* Getting audio duration */
                    const tmpAudio = document.createElement('audio')
                    tmpAudio.setAttribute('preload', 'metadata')
                    tmpAudio.src = URL.createObjectURL(file)

                    // Wait for duration to be recorded
                    await new Promise((res, rej) => {
                            tmpAudio.onloadedmetadata = () => {
                                res()
                            }
                        })

                    // save it to duration
                    const duration = `${(tmpAudio.duration / 60).toFixed(0)}:${(tmpAudio.duration % 60).toFixed(0).padStart(2, "0")}`
                    const title  = tags['title'] || file['name']
                    console.log(tags['album'])
                    const album  = (tags['album'] && `• ${tags['album']}`) || ''
                    const artist = tags['artist'] && (`${tags['artist']} ${album}`) || ''
                    const img    = tags['picture']?.['data'] ?  "data:image/png;base64," + bytesArrToBase64(tags['picture']?.['data']) : 'https://upload.wikimedia.org/wikipedia/en/e/e6/AllAmerikkkanBadass.jpg'

                    const div = document.createElement('div')
                    div.innerHTML = songElementFn(title, artist, duration).trim()
                    const songCard = div.firstChild
                    songCard.getElementsByTagName('img')[0].src = img
                    songCard.onclick = () => {
                        jsmediatags.read(file, {
                            'onSuccess': ({ tags }) => {
                                console.log(tags);
                                document.getElementById('song-img').src = img
                                document.getElementById('song-title').textContent  = title
                                document.getElementById('song-artist').textContent = artist

                                const $slider = document.getElementById('slider')
                                const $audio_player = document.getElementById('audio-player')

                                $audio_player.src = URL.createObjectURL(file)
                                $audio_player.ontimeupdate = () => {

                                    const currentTimeMinutes = `${($audio_player.currentTime / 60).toFixed(0)}`
                                    const currentTimeSeconds = `${($audio_player.currentTime % 60).toFixed(0)}`

                                    const timeLeft    = tmpAudio.duration - $audio_player.currentTime
                                    const timeLeftMinutes = `${(timeLeft / 60).toFixed(0)}`
                                    const timeLeftSeconds = `${(timeLeft % 60).toFixed(0)}`

                                    document.getElementsByClassName('time_elapsed')[0].datetime  = `PT${currentTimeMinutes}M${currentTimeSeconds}S`
                                    document.getElementsByClassName('time_elapsed')[0].innerHTML =`${currentTimeMinutes}:${currentTimeSeconds.padStart(2, "0")}s`
                                    document.getElementsByClassName('time_remaining')[0].datetime = `PT$${timeLeftMinutes}M${timeLeftSeconds}S`
                                    document.getElementsByClassName('time_remaining')[0].innerHTML = `-${timeLeftMinutes}:${timeLeftSeconds.padStart(2, "0")}s`

                                    // Trigger 'input' event so listener, can handle it
                                    $slider.value = $audio_player.currentTime
                                    const event = new Event('input', {
                                                        bubbles: true,
                                                        cancelable: true
                                                    })

                                    $slider.dispatchEvent(event)
                                }

                                $slider.value = 0
                                $slider.step = 1
                                $slider.min = 0
                                $slider.max = Math.floor(tmpAudio.duration)
                                $slider.addEventListener('change', () => $audio_player.currentTime = $slider.value)

                            }
                        })
                    }
                    document.getElementById('playlist').appendChild(songCard)
                }
            })
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
    return document.getElementsByTagName('audio')[0].play()
}

const pauseAudio = () => {
    changePlayButtonUI({ isPlaying: false, buttonStyle: pauseStyle })
    return document.getElementsByTagName('audio')[0].pause()
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

    document.getElementById('audio-player').onpause = (e) => {
        changePlayButtonUI({ isPlaying: false, buttonStyle: playStyle })
    }

    document.getElementById('audio-player').onplay = (e) => {
        changePlayButtonUI({ isPlaying: true, buttonStyle: pauseStyle })
    }
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
