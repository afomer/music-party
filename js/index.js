const svgPauseElement = `<svg width="10em" height="10em" viewBox="0 0 16 16" class="bi bi-pause-fill" fill="currentColor" xmlns="http://www.w3.org/2000/svg">
        <path d="M5.5 3.5A1.5 1.5 0 0 1 7 5v6a1.5 1.5 0 0 1-3 0V5a1.5 1.5 0 0 1 1.5-1.5zm5 0A1.5 1.5 0 0 1 12 5v6a1.5 1.5 0 0 1-3 0V5a1.5 1.5 0 0 1 1.5-1.5z"/>
    </svg>`

const svgPlayElement = `<svg width="10em" height="10em" viewBox="0 0 16 16" class="bi bi-play-fill" fill="currentColor" xmlns="http://www.w3.org/2000/svg">
        <path d="M11.596 8.697l-6.363 3.692c-.54.313-1.233-.066-1.233-.697V4.308c0-.63.692-1.01 1.233-.696l6.363 3.692a.802.802 0 0 1 0 1.393z"/>
    </svg>`

// Add songs in a list format
function songElementFn(title, artist, duration) {
    return (`<div class="song-card">
        <div style="flex: 1; margin-right: 6px">
            <img style="border-radius: 3px; height: 100%; width: 100%;"/>
        </div>

        <div style="flex: 9; display: flex; flex-direction: column;">

            <div style="display: flex; justify-content: space-between">
                <div style="font-size: 1vw; text-overflow: ellipsis; overflow: hidden; white-space: nowrap;">
                    ${title}
                </div>

                <div style="font-size: 0.8em;font-weight: 100;">
                    ${duration}
                </div>
            </div>

            <div style="font-size: 0.8em;font-weight: 100;">
                ${artist}
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
                    const duration = `${(tmpAudio.duration / 60).toFixed(0)}m ${(tmpAudio.duration % 60).toFixed(0)}s`
                    const title  = tags['title'] || file['name']
                    const artist = tags['artist'] || ''
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

function activatePlayButton() {
    document.getElementById('play-button').onclick = (e) => {
        const isPlaying = document.getElementById('play-button').getAttribute('playing')
        if (isPlaying == "true") {
            document.getElementById('play-button').setAttribute('playing', false)
            document.getElementById('play-button').firstElementChild.setAttribute('class', 'fas fa-pause fa-lg')
            document.getElementsByTagName('audio')[0].pause()
        } else {
            document.getElementById('play-button').setAttribute('playing', true)
            document.getElementById('play-button').firstElementChild.setAttribute('class', 'fas fa-play fa-lg')
            document.getElementsByTagName('audio')[0].play()
        }
    }

    document.getElementById('audio-player').onpause = (e) => {
        document.getElementById('play-button').setAttribute('playing', false)
        document.getElementById('play-button').firstElementChild.setAttribute('class', 'fas fa-play fa-lg')
    }

    document.getElementById('audio-player').onplay = (e) => {
        document.getElementById('play-button').setAttribute('playing', true)
        document.getElementById('play-button').firstElementChild.setAttribute('class', 'fas fa-pause fa-lg')
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
