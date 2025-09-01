// --------------------------------------------------------------------------------------
// Helpers

function now() {
    return Math.floor(Date.now() / 1000)
}

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
    "fullscreen",
    "unmute"
]) {
    el[name] = document.getElementById(name)
}
const socket = io()
let room = null
let controlsVisible = true
let hideTimeout = null

// --------------------------------------------------------------------------------------
// Event Handlers

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
        el.videoControls.style.display = "flex"

        if (hideTimeout != null) {
            clearTimeout(hideTimeout)
        }
        hideTimeout = setTimeout(() => {
            hideTimeout = null
            window.hideControls()
        }, 3000)
    }
}

window.toggleFullscreen = () => {
    if (!document.fullscreenElement) {
        el.videoContainer.requestFullscreen()
    } else {
        document.exitFullscreen()
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
            el.v.src = room.url
            el.url.value = room.url

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

socket.on("connect", () => {
    console.log("Connected!")

    // clue in the server which room we walked into
    let roomPayload = {
        room: window.ROOM
    }
    if (el.v.src && el.v.src.length > 0) {
        roomPayload.url = el.v.src
        if (el.v.currentTime > 0) {
            roomPayload.pos = el.v.currentTime
        }
    }
    socket.emit("room", roomPayload)
})

function init() {
    // Instantiate the clipboard helper
    new ClipboardJS("#share")

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
        if (el.v.paused) {
            socket.emit("play", { room: window.ROOM, pos: el.v.currentTime })
        } else {
            socket.emit("pause", { room: window.ROOM, pos: el.v.currentTime })
        }
    })

    // the fullscreen button toggle
    el.fullscreen.addEventListener("click", () => {
        toggleFullscreen()
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
                url: el.url.value
            }
            socket.emit("room", roomPayload)
        }
    })
}

document.addEventListener("DOMContentLoaded", init)
