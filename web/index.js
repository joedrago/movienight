// --------------------------------------------------------------------------------------
// Helpers

const NOTIFICATION_DURATION_SECONDS = 6

const QUICK_SEEK_SECONDS = 10

function now() {
    return Math.floor(Date.now() / 1000)
}

function secondsToHms(d) {
    d = Number(d)

    var h = Math.floor(d / 3600)
    var m = Math.floor((d % 3600) / 60)
    var s = Math.floor((d % 3600) % 60)

    return ("0" + h).slice(-2) + ":" + ("0" + m).slice(-2) + ":" + ("0" + s).slice(-2)
}

// --------------------------------------------------------------------------------------
// UID

let UID = localStorage.getItem("movienightUID")
if (!UID) {
    UID = crypto.randomUUID()
    localStorage.setItem("movienightUID", UID)
}
console.log(`UID: ${UID}`)

// --------------------------------------------------------------------------------------
// Globals

const el = {}
for (let name of [
    "videoContainer",
    "urlControls",
    "videoControls",
    "v",
    "url",
    "pause",
    "seek",
    "volume",
    "subs",
    "fullscreen",
    "unmute",
    "notification"
]) {
    el[name] = document.getElementById(name)
}
const socket = io()
let room = null
let controlsVisible = true
let hideTimeout = null
let notifications = []
let allowVideoControls = false
let subsTrackDom = null

// --------------------------------------------------------------------------------------
// Event Handlers

const updateNotifications = () => {
    let kept = []
    let text = ""
    let n = null
    let curTime = now()
    while ((n = notifications.shift())) {
        let name = n.name
        if (socket.id == n.id) {
            name += `<span class="notificationyou"> (You)</span>`
        }
        text += `<span class="notificationname">${name}</span><span class="notificationtext">: ${n.text}</span><br>`
        if (curTime < n.time + NOTIFICATION_DURATION_SECONDS) {
            kept.push(n)
        }
    }
    notifications = kept
    el.notification.innerHTML = text
}
setInterval(() => {
    updateNotifications()
}, 1000)

window.hideControls = () => {
    if (controlsVisible) {
        controlsVisible = false
        el.urlControls.style.display = "none"
        el.videoControls.style.display = "none"
    }
}

window.showControls = () => {
    if (!controlsVisible) {
        controlsVisible = true
        el.urlControls.style.display = "flex"
        if (allowVideoControls) {
            el.videoControls.style.display = "flex"
        }
    }

    if (hideTimeout != null) {
        clearTimeout(hideTimeout)
    }
    hideTimeout = setTimeout(() => {
        hideTimeout = null
        window.hideControls()
    }, 3000)
}

window.toggleFullscreen = () => {
    if (!document.fullscreenElement) {
        el.videoContainer.requestFullscreen()
    } else {
        document.exitFullscreen()
    }
}

window.toggleSubs = () => {
    let track = el.v.textTracks && el.v.textTracks[0]
    if (track) {
        if (track.mode == "showing") {
            track.mode = "hidden"
        } else {
            track.mode = "showing"
        }
    }
}

window.togglePlayPause = () => {
    if (el.v.paused) {
        socket.emit("play", { room: window.ROOM, pos: el.v.currentTime })
    } else {
        socket.emit("pause", { room: window.ROOM, pos: el.v.currentTime })
    }
}

socket.on("room", (msg) => {
    console.log("room: ", msg)

    let newVideo = false
    if (!room || (msg.url && room.url != msg.url)) {
        newVideo = true
    }
    room = msg

    if (newVideo) {
        if (room.url) {
            let url = room.url
            let vtturl = null
            const matches = room.url.match(/^(.+)\.vtt$/)
            if (matches) {
                vtturl = room.url
                url = matches[1]
            }

            el.v.src = url
            el.url.value = room.url
            allowVideoControls = true

            // This only works if your server hosting the VTT has something
            // similar to this nginx settings (feel free to restrict it
            // further):
            //
            // location / {
            //     add_header 'Access-Control-Allow-Origin' '*' always;
            // }

            if (subsTrackDom) {
                el.v.removeChild(subsTrackDom)
                subsTrackDom = null
            }

            if (vtturl != null) {
                let subtitles = document.createElement("track")
                subtitles.src = vtturl
                subtitles.kind = "captions"
                subtitles.label = "English"
                subtitles.srclang = "en"
                el.v.appendChild(subtitles)
                subsTrackDom = subtitles
                let track = el.v.textTracks && el.v.textTracks[0]
                if (track) {
                    track.mode = "showing"
                }
                el.subs.style.display = "flex"
            }

            try {
                const u = new URL(room.url)
                if (u && u.pathname) {
                    const matches = String(u.pathname).match(/\/([^\/]+)\.mp4/)
                    if (matches) {
                        document.title = `Movie Night: ${matches[1]}`
                    }
                }
            } catch (e) {
                // who cares
            }
        } else {
            el.v.src = ""
        }
    }

    // const delta = Math.abs(v.currentTime - room.pos)
    v.currentTime = room.pos
    if (room.playing) {
        v.autoplay = true
        v.play()
    } else {
        v.autoplay = false
        v.pause()
    }
})

socket.on("info", (msg) => {
    console.log("info: ", msg)

    if (msg.nick) {
        document.getElementById("who").innerHTML = msg.nick
    }
    if (typeof msg.count == "number") {
        document.getElementById("count").innerHTML = `${msg.count} watching`
    }
})

socket.on("notify", (msg) => {
    if (msg.text && msg.text.length > 0) {
        notifications.push({
            id: msg.id,
            text: msg.text,
            name: msg.name,
            time: now()
        })
        updateNotifications()
    }
})

socket.on("connect", () => {
    console.log("Connected!")

    // clue in the server which room we walked into
    let roomPayload = {
        room: window.ROOM,
        uid: UID
    }
    if (el.v.src && el.v.src.length > 0 && el.v.src != window.location) {
        let src = el.v.src
        let track = el.v.textTracks && el.v.textTracks[0]
        if (track) {
            src += ".vtt"
        }
        console.log(`src: ${src}`)
        roomPayload.url = src
        if (el.v.currentTime > 0) {
            roomPayload.pos = el.v.currentTime
        }
    }
    socket.emit("room", roomPayload)
})

function init() {
    // Kick the player after a new .src load
    el.v.addEventListener("loadeddata", () => {
        el.v.currentTime = room.pos
        if (room.playing) {
            console.log(`room is playing`)
            el.v.autoplay = true
        }
    })

    // the pause button toggle
    el.pause.addEventListener("click", () => {
        togglePlayPause()
    })

    // the fullscreen button toggle
    el.fullscreen.addEventListener("click", () => {
        toggleFullscreen()
    })

    // subs toggle
    el.subs.addEventListener("click", () => {
        toggleSubs()
    })

    // Remove the Click panel
    el.unmute.addEventListener("click", () => {
        el.unmute.style.display = "none"
        el.v.muted = false
        el.volume.value = Math.floor(el.v.volume * 100)

        // Listen for mouse events to hide/show all controls. NOTE: we don't
        // offer these events until they successfully click away the Unmute
        // panel.
        el.videoContainer.addEventListener(
            "mousemove",
            (event) => {
                window.showControls()
            },
            false
        )
        el.videoContainer.addEventListener(
            "mouseout",
            (event) => {
                window.hideControls()
            },
            false
        )
    })

    // the main video itself was clicked
    el.v.addEventListener("click", () => {
        // Do nothing, for now
    })

    // Update the seek bar as the video plays
    v.addEventListener("timeupdate", () => {
        const value = (100 / el.v.duration) * el.v.currentTime
        el.seek.value = value
        // console.log("v.timeupdate")
        document.getElementById("pos").innerHTML = secondsToHms(el.v.currentTime)
    })

    // Seek to the new time when the seek bar value changes
    seek.addEventListener("input", () => {
        const time = el.v.duration * (el.seek.value / 100)
        // el.v.currentTime = time
        socket.emit("seek", { room: window.ROOM, pos: time })
    })

    // volume control
    volume.addEventListener("change", (ev) => {
        ev.preventDefault()
        el.v.muted = false
        el.v.volume = el.volume.value / 100
        console.log(`volume.change ${(el.volume.value / 100).toFixed(2)}`)
    })

    // listen for the enter key in the input box at the top and set a new url
    el.url.addEventListener("keyup", function (e) {
        if (e.key === "Enter" || e.keyCode === 13) {
            console.log(`setting url: ${el.url.value}`)
            let roomPayload = {
                room: window.ROOM,
                url: el.url.value,
                uid: UID
            }
            socket.emit("room", roomPayload)
        }
    })

    document.addEventListener("keydown", function (event) {
        // console.log(`Key pressed: "${event.key}"`)
        if (event.key == "ArrowLeft") {
            if (el.v.currentTime != null && el.v.currentTime > 0) {
                let newTime = el.v.currentTime - QUICK_SEEK_SECONDS
                if (newTime < 0) {
                    newTime = 0
                }
                socket.emit("seek", { room: window.ROOM, pos: newTime })
            }
        } else if (event.key == "ArrowRight") {
            if (el.v.currentTime != null && el.v.currentTime > 0) {
                let newTime = el.v.currentTime + QUICK_SEEK_SECONDS
                socket.emit("seek", { room: window.ROOM, pos: newTime })
            }
        } else if (event.key == " ") {
            togglePlayPause()
        }
    })

    updateNotifications()
}

document.addEventListener("DOMContentLoaded", init)
