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
                <div style="font-size: 1vw; text-overflow: ellipsis; overflow: hidden; white-space: nowrap;" id="song-title">
                    ${title}
                </div>

                <div style="font-size: 0.8em;font-weight: 100;" id="song-artist">
                    ${duration}
                </div>
            </div>

            <div style="font-size: 0.8em;font-weight: 100;" id="song-artist">
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

                                    document.getElementById('slider').value = $audio_player.currentTime
                                    document.getElementsByClassName('time_elapsed')[0].datetime  = `PT${currentTimeMinutes}M${currentTimeSeconds}S`
                                    document.getElementsByClassName('time_elapsed')[0].innerHTML =`${currentTimeMinutes}:${currentTimeSeconds.padStart(2, "0")}s`
                                    document.getElementsByClassName('time_remaining')[0].datetime = `PT$${timeLeftMinutes}M${timeLeftSeconds}S`
                                    document.getElementsByClassName('time_remaining')[0].innerHTML = `-${timeLeftMinutes}:${timeLeftSeconds.padStart(2, "0")}s`
                                }

                                $slider.value = 0
                                $slider.step = 1
                                $slider.min = 0
                                $slider.max = Math.floor(tmpAudio.duration)
                                $slider.onchange = () => $audio_player.currentTime = $slider.value

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
        let result = ''
        const isPlaying = document.getElementById('play-button').getAttribute('playing')
        console.log('WTF', isPlaying)
        if (isPlaying == "true") {
            result = svgPauseElement
            document.getElementById('play-button').setAttribute('playing', false)
            document.getElementsByTagName('audio')[0].pause()
        } else {
            result = svgPlayElement
            document.getElementById('play-button').setAttribute('playing', true)
            document.getElementsByTagName('audio')[0].play()
        }
        document.getElementById('play-button').innerHTML = result
    }

    document.getElementById('audio-player').onpause = (e) => {
        let result = svgPlayElement
        document.getElementById('play-button').setAttribute('playing', false)
        document.getElementById('play-button').innerHTML = result
    }

    document.getElementById('audio-player').onplay = (e) => {
        let result = svgPauseElement
        document.getElementById('play-button').setAttribute('playing', true)
        document.getElementById('play-button').innerHTML = result
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


