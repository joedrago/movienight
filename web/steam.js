// --------------------------------------------------------------------------------------
// Globals

const socket = io()
let iframe = null
let movies = []

function getSourcesFromQueryString() {
    const params = new URLSearchParams(window.location.search)
    return params.getAll("source")
}

const sources = getSourcesFromQueryString()
const overlayList = new OverlayList(() => {
    if (iframe) {
        iframe.focus()
    }
})

// --------------------------------------------------------------------------------------
// Socket Events

socket.on("connect", () => {
    console.log("Connected!")
})

socket.on("available", (msg) => {
    console.log("Available:", msg)
    movies = msg.movies || []
    const rooms = ["[New Room]", ...(msg.rooms || [])]
    overlayList.show(
        rooms,
        (room) => {
            console.log("Room chosen:", room)
            if (room === "[New Room]") {
                createIframe("/")
            } else {
                createIframe(`/${room}`)
            }
        },
        () => {
            console.log("Selection cancelled")
            window.close()
        }
    )
})

// --------------------------------------------------------------------------------------
// Iframe

function createIframe(src) {
    if (iframe) {
        iframe.src = src
        return
    }
    iframe = document.createElement("iframe")
    iframe.src = src
    iframe.style.position = "fixed"
    iframe.style.top = "0"
    iframe.style.left = "0"
    iframe.style.width = "100%"
    iframe.style.height = "100%"
    iframe.style.border = "none"
    iframe.allow = "autoplay; fullscreen"
    iframe.allowFullscreen = true
    iframe.addEventListener("load", () => {
        iframe.contentWindow.postMessage({ type: "steam", movies }, "*")
    })
    document.body.appendChild(iframe)
    iframe.requestFullscreen().catch((err) => {
        console.log("Fullscreen request failed:", err.message)
    })
}

// --------------------------------------------------------------------------------------
// Init

function init() {
    new GamepadListener((btn) => {
        if (btn === "y") {
            location.reload()
        }
    })
    socket.emit("available", { sources })
}

document.addEventListener("DOMContentLoaded", init)
