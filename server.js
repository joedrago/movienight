const bodyParser = require("body-parser")
const express = require("express")
const fs = require("fs")

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

class Room {
    constructor(name) {
        this.name = name
        this.url = ""
        this.pos = 0
        this.playing = true
        this.updated = now()
        this.sockets = {}
    }

    connect(socket) {
        console.log(`[${this.name}] connect(${socket.id})`)
        this.sockets[socket.id] = socket
        this.send(socket)
    }

    disconnect(socket) {
        if (this.sockets[socket.id]) {
            console.log(`[${this.name}] disconnect(${socket.id})`)
            delete this.sockets[socket.id]
        }
    }

    // TODO: dont advance time while paused!
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

    broadcast(senderID) {
        for (let id in this.sockets) {
            // if (id == senderID) {
            //     continue
            // }
            const socket = this.sockets[id]
            this.send(socket)
        }
    }

    setUrl(url) {
        if (this.url != url) {
            console.log(`[${this.name}] setUrl(${url})`)
            this.url = url
            this.pos = 0
            this.updated = now()
            this.broadcast()
        } else {
            console.log(`[${this.name}] setUrl(${url}) (ignored)`)
        }
    }

    pause(pos, senderID) {
        console.log(`[${this.name}] pause()`)
        this.playing = false
        this.pos = pos
        this.updated = now()
        this.broadcast(senderID)
    }

    play(pos, senderID) {
        console.log(`[${this.name}] play()`)
        this.playing = true
        this.pos = pos
        this.updated = now()
        this.broadcast(senderID)
    }

    seek(pos, senderID) {
        console.log(`[${this.name}] seek(${pos})`)
        this.pos = pos
        this.updated = now()
        this.broadcast(senderID)
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
                rooms[roomName].connect(socket)
                if (msg.url) {
                    console.log(`[${roomName}] initial room url: ${msg.url}`)
                    rooms[roomName].setUrl(msg.url)
                    if (msg.pos) {
                        console.log(`[${roomName}] initial room pos: ${msg.pos}`)
                        rooms[roomName].seek(msg.pos, socket.id)
                    }
                }
            }
        })

        socket.on("pause", (msg) => {
            const roomName = msg.room
            if (roomName && rooms[roomName]) {
                const room = rooms[roomName]
                room.pause(msg.pos, socket.id)
            }
        })
        socket.on("play", (msg) => {
            const roomName = msg.room
            if (roomName && rooms[roomName]) {
                const room = rooms[roomName]
                room.play(msg.pos, socket.id)
            }
        })
        socket.on("seek", (msg) => {
            const roomName = msg.room
            if (roomName && rooms[roomName]) {
                const room = rooms[roomName]
                room.seek(msg.pos, socket.id)
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
