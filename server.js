const bodyParser = require("body-parser")
const express = require("express")
const fs = require("fs")
const { randomName } = require("./names")

const PRUNE_ROOM_INTERVAL_SECONDS = 300
const PRUNE_ROOM_MAX_AGE_SECONDS = 3600

const BIG_SEEK_SECONDS = 60
const WAIT_FOR_LOADING_SECONDS = 5

const SERVER_SENDER_ID = "*SERVER*"
const SERVER_NAME = `<span class="servername">Movie Night</span>`

let rooms = {}

function now() {
    return Math.floor(Date.now() / 1000)
}

function randomShortString() {
    return Math.random().toString(36).substring(2, 6).toLowerCase()
}

function unusedRoomName() {
    while (true) {
        const roomName = randomShortString()
        if (!rooms[roomName]) {
            return roomName
        }
    }
}

function sanitizeRoomName(name) {
    return name.replaceAll(/[^A-Za-z0-9]/g, "")
}

function prettyPos(totalSeconds) {
    const hours = Math.floor(totalSeconds / 3600)
    const minutes = Math.floor((totalSeconds % 3600) / 60)
    const seconds = Math.floor(totalSeconds % 60)

    // Pad single-digit numbers with a leading zero for consistent formatting
    const formattedHours = String(hours).padStart(2, "0")
    const formattedMinutes = String(minutes).padStart(2, "0")
    const formattedSeconds = String(seconds).padStart(2, "0")

    return `${formattedHours}:${formattedMinutes}:${formattedSeconds}`
}

function pruneRooms() {
    const roomList = Object.keys(rooms)
    for (let roomName of roomList) {
        const room = rooms[roomName]
        const countAge = now() - room.countUpdated
        if (room.count == 0 && countAge > PRUNE_ROOM_MAX_AGE_SECONDS) {
            console.log(`[${room.name}]: Pruning; ${countAge.toFixed(2)} seconds with 0 participants`)
            delete rooms[roomName]
        }
    }
}

class Room {
    constructor(name) {
        this.name = name
        this.url = ""
        this.pos = 0
        this.count = 0
        this.playing = true
        this.updated = now()
        this.countUpdated = now()
        this.sockets = {}
        this.names = {}
        this.names[SERVER_SENDER_ID] = SERVER_NAME
        this.loadTimeout = null
    }

    connect(socket, uid) {
        console.log(`[${this.name}] connect(${socket.id})`)
        if (!this.sockets[socket.id]) {
            this.sockets[socket.id] = socket

            ++this.count
            this.countUpdated = now()
            console.log(`[${this.name}] now has ${this.count} participants`)
        }
        let sendJoined = false
        if (!this.names[uid]) {
            this.names[uid] = randomName()
            sendJoined = true
        }
        this.names[socket.id] = this.names[uid]
        if (sendJoined) {
            this.notify(socket.id, `Joined`)
        }
        this.send(socket)
        this.broadcastInfo()
    }

    disconnect(socket) {
        if (this.sockets[socket.id]) {
            console.log(`[${this.name}] disconnect(${socket.id})`)
            delete this.sockets[socket.id]

            --this.count
            this.countUpdated = now()
            console.log(`[${this.name}] now has ${this.count} participants`)
            this.broadcastInfo()
        }
    }

    send(socket) {
        console.log(`[${this.name}] send(${socket.id})`)
        const broadcastPos = this.pos + (now() - this.updated)
        socket.emit("room", {
            name: this.name,
            url: this.url,
            playing: this.playing,
            pos: broadcastPos
        })
    }

    broadcast() {
        for (let id in this.sockets) {
            const socket = this.sockets[id]
            this.send(socket)
        }
    }

    info(socket) {
        console.log(`[${this.name}] info(${socket.id})`)
        socket.emit("info", {
            nick: this.names[socket.id],
            count: this.count
        })
    }

    broadcastInfo() {
        for (let id in this.sockets) {
            const socket = this.sockets[id]
            this.info(socket)
        }
    }

    notify(senderID, text) {
        for (let id in this.sockets) {
            const socket = this.sockets[id]
            socket.emit("notify", {
                id: senderID,
                name: this.names[senderID],
                text: text
            })
        }
    }

    showPatience(reason, pos) {
        this.notify(SERVER_SENDER_ID, `[${reason}] Waiting ${WAIT_FOR_LOADING_SECONDS} seconds for everyone to load...`)
        if (this.loadTimeout != null) {
            clearTimeout(this.loadTimeout)
            this.loadTimeout = null
        }
        this.loadTimeout = setTimeout(() => {
            this.loadTimeout = null
            this.notify(SERVER_SENDER_ID, `Showtime!`)
            this.play(null, pos)
        }, WAIT_FOR_LOADING_SECONDS * 1000)
    }

    setUrl(senderID, url) {
        if (url != null && url.length > 0 && this.url != url) {
            console.log(`[${this.name}] setUrl(${url})`)
            this.url = url
            this.playing = false
            this.pos = 0
            this.updated = now()
            this.broadcast()
            if (senderID != null) {
                this.notify(senderID, `URL ${url}`)
            }
            this.showPatience("setUrl", 0)
        } else {
            console.log(`[${this.name}] setUrl(${url}) (ignored)`)
        }
    }

    pause(senderID, pos) {
        console.log(`[${this.name}] pause() ${pos}`)
        if (pos != null && pos >= 0) {
            this.playing = false
            this.pos = pos
            this.updated = now()
            if (this.loadTimeout != null) {
                clearTimeout(this.loadTimeout)
                this.loadTimeout = null
                this.playing = true
            }
            this.broadcast()
            if (senderID != null) {
                this.notify(senderID, `Pause`)
            }
        }
    }

    play(senderID, pos) {
        console.log(`[${this.name}] play() ${pos}`)
        if (pos != null && pos >= 0) {
            this.playing = true
            this.pos = pos
            this.updated = now()
            if (this.loadTimeout != null) {
                clearTimeout(this.loadTimeout)
                this.loadTimeout = null
                this.playing = true
            }
            this.broadcast()
            if (senderID != null) {
                this.notify(senderID, `Play`)
            }
        }
    }

    seek(senderID, pos) {
        console.log(`[${this.name}] seek(${pos})`)
        if (pos != null && pos >= 0) {
            const prevPos = this.pos + (now() - this.updated)
            const deltaPos = Math.abs(prevPos - pos)
            const bigSeek = (deltaPos >= BIG_SEEK_SECONDS) || (this.loadTimeout != null)
            this.pos = pos
            this.updated = now()
            if (this.loadTimeout != null) {
                clearTimeout(this.loadTimeout)
                this.loadTimeout = null
            }
            this.playing = !bigSeek
            this.broadcast()
            if (senderID != null) {
                this.notify(senderID, `Seek ${prettyPos(pos)}`)
            }
            if (bigSeek) {
                this.showPatience("seek", pos)
            }
        }
    }
}

async function main(argv) {
    const app = express()
    const http = require("http").createServer(app)

    io = require("socket.io")(http, { pingTimeout: 10000 })
    io.on("connection", (socket) => {
        console.log(`New Connection: ${socket.id}`)

        socket.on("room", (msg) => {
            const roomName = msg.room
            if (roomName) {
                if (!rooms[roomName]) {
                    rooms[roomName] = new Room(roomName)
                }
                rooms[roomName].connect(socket, msg.uid)
                if (msg.url) {
                    console.log(`[${roomName}] initial room url: ${msg.url}`)
                    rooms[roomName].setUrl(socket.id, msg.url)
                    if (msg.pos) {
                        console.log(`[${roomName}] initial room pos: ${msg.pos}`)
                        rooms[roomName].seek(socket.id, msg.pos)
                    }
                }
            }
        })

        socket.on("pause", (msg) => {
            const roomName = msg.room
            if (roomName && rooms[roomName]) {
                const room = rooms[roomName]
                room.pause(socket.id, msg.pos)
            }
        })
        socket.on("play", (msg) => {
            const roomName = msg.room
            if (roomName && rooms[roomName]) {
                const room = rooms[roomName]
                room.play(socket.id, msg.pos)
            }
        })
        socket.on("seek", (msg) => {
            const roomName = msg.room
            if (roomName && rooms[roomName]) {
                const room = rooms[roomName]
                room.seek(socket.id, msg.pos)
            }
        })

        socket.on("disconnect", () => {
            for (let roomName in rooms) {
                const room = rooms[roomName]
                room.disconnect(socket)
            }
        })
    })

    app.get("/", (req, res) => {
        return res.redirect(`/${encodeURIComponent(unusedRoomName())}`)
    })

    app.use("/_web", express.static("web"))

    app.get("/:room", (req, res) => {
        const sanitized = sanitizeRoomName(req.params.room)
        if (sanitized != req.params.room) {
            return res.redirect(`/${encodeURIComponent(sanitized)}`)
        }

        html = fs.readFileSync(`${__dirname}/web/index.html`, "utf8")
        html = html.replace(/!ROOM!/, sanitized)
        res.send(html)
    })

    setInterval(pruneRooms, PRUNE_ROOM_INTERVAL_SECONDS * 1000)

    app.use(bodyParser.json())

    host = "127.0.0.1"
    // if (argv.length > 0) {
    //     host = "0.0.0.0"
    // }

    http.listen(3033, host, () => {
        console.log(`listening on ${host}:3033`)
    })
}

main(process.argv.slice(2))
