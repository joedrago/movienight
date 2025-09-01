// --------------------------------------------------------------------------------------
// Helpers

function qs(name) {
    let url = window.location.href
    name = name.replace(/[\[\]]/g, "\\$&")
    let regex = new RegExp("[?&]" + name + "(=([^&#]*)|&|#|$)")
    let results = regex.exec(url)
    if (!results || !results[2]) {
        return null
    }
    return decodeURIComponent(results[2].replace(/\+/g, " "))
}

function now() {
    return Math.floor(Date.now() / 1000)
}

// --------------------------------------------------------------------------------------
// Globals

const qsroom = qs("room")
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
    // const v = document.getElementById("v")
    // if (v) {
    //     v.removeAttribute("controls")
    // }

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

    let roomPayload = {
        room: qsroom
    }
    socket.emit("room", roomPayload)
})

function init() {
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

    el.v.addEventListener("loadeddata", () => {
        el.v.currentTime = room.pos
        if (room.playing) {
            console.log(`room is playing`)
            el.v.autoplay = true
        }
    })

    // el.v.addEventListener("seeked", () => {
    //     console.log("SEEKED")
    //     const delta = Math.abs(v.currentTime - room.pos)
    //     if (delta > 1) {
    //         socket.emit("seek", { room: qsroom, pos: v.currentTime })
    //     }
    // })

    el.pause.addEventListener("click", () => {
        console.log("el.pause click")
        if (el.v.paused) {
            socket.emit("play", { room: qsroom, pos: el.v.currentTime })
        } else {
            socket.emit("pause", { room: qsroom, pos: el.v.currentTime })
        }
    })

    el.fullscreen.addEventListener("click", () => {
        toggleFullscreen()
    })

    el.v.addEventListener("click", () => {
        el.unmute.style.display = "none"
        el.v.muted = false
        el.volume.value = Math.floor(el.v.volume * 100)
        console.log(`v.click ${el.volume.value}`)
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
        socket.emit("seek", { room: qsroom, pos: time })
    })

    volume.addEventListener("change", (ev) => {
        ev.preventDefault()
        el.v.muted = false
        el.v.volume = el.volume.value / 100
        console.log(`volume.change ${(el.volume.value / 100).toFixed(2)}`)
    })

    el.url.addEventListener("keyup", function (e) {
        if (e.key === "Enter" || e.keyCode === 13) {
            console.log(`setting url: ${el.url.value}`)
            let roomPayload = {
                room: qsroom,
                url: el.url.value
            }
            socket.emit("room", roomPayload)
        }
    })
}

document.addEventListener("DOMContentLoaded", init)
