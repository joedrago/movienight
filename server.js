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

const clone = (o) => {
    return JSON.parse(JSON.stringify(o))
}

const shuffle = (array) => {
    for (let i = array.length - 1; i > 0; --i) {
        const j = Math.floor(Math.random() * (i + 1))
        const temp = array[i]
        array[i] = array[j]
        array[j] = temp
    }
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

const NAMES = [
    "Banjo",
    "Bayonetta",
    "Bowser Jr.",
    "Bowser",
    "Byleth",
    "Captain Falcon",
    "Charizard",
    "Chrom",
    "Cloud",
    "Corrin",
    "Daisy",
    "Dark Pit",
    "Dark Samus",
    "Diddy Kong",
    "Donkey Kong",
    "Dr. Mario",
    "Duck Hunt",
    "Falco",
    "Fox",
    "Ganondorf",
    "Greninja",
    "Hero",
    "Ice Climbers",
    "Ike",
    "Incineroar",
    "Inkling",
    "Isabelle",
    "Ivysaur",
    "Jigglypuff",
    "Joker",
    "Kazooie",
    "Kazuya",
    "Ken",
    "King Dedede",
    "King K. Rool",
    "Kirby",
    "Link",
    "Little Mac",
    "Lucario",
    "Lucas",
    "Lucina",
    "Luigi",
    "Mario",
    "Marth",
    "Mega Man",
    "Meta Knight",
    "Mewtwo",
    "Mii Brawler",
    "Mii Gunner",
    "Mii Swordfighter",
    "Min Min",
    "Mr. Game & Watch",
    "Mythra",
    "Ness",
    "Olimar",
    "Pac-Man",
    "Palutena",
    "Peach",
    "Pichu",
    "Pikachu",
    "Piranha Plant",
    "Pit",
    "Pyra",
    "R.O.B.",
    "Richter",
    "Ridley",
    "Robin",
    "Rosalina",
    "Roy",
    "Ryu",
    "Samus",
    "Sephiroth",
    "Sheik",
    "Shulk",
    "Simon",
    "Snake",
    "Sonic",
    "Sora",
    "Squirtle",
    "Steve",
    "Terry",
    "Toon Link",
    "Villager",
    "Wario",
    "Wii Fit Trainer",
    "Wolf",
    "Yoshi",
    "Young Link",
    "Zelda",
    "Zero Suit Samus"
]

let namePool = []
function randomName() {
    if (namePool.length < 1) {
        namePool = clone(NAMES)
        shuffle(namePool)
    }
    return namePool.shift()
}

class Room {
    constructor(name) {
        this.name = name
        this.url = ""
        this.pos = 0
        this.playing = true
        this.updated = now()
        this.sockets = {}
        this.names = {}
    }

    connect(socket, uid) {
        console.log(`[${this.name}] connect(${socket.id})`)
        this.sockets[socket.id] = socket
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
    }

    disconnect(socket) {
        if (this.sockets[socket.id]) {
            console.log(`[${this.name}] disconnect(${socket.id})`)
            delete this.sockets[socket.id]
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

    broadcast(senderID) {
        for (let id in this.sockets) {
            const socket = this.sockets[id]
            this.send(socket)
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

    setUrl(senderID, url) {
        if (url != null && url.length > 0 && this.url != url) {
            console.log(`[${this.name}] setUrl(${url})`)
            this.url = url
            this.pos = 0
            this.updated = now()
            this.broadcast()
            this.notify(senderID, `URL ${url}`)
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
            this.broadcast(senderID)
            this.notify(senderID, `Pause`)
        }
    }

    play(senderID, pos) {
        console.log(`[${this.name}] play() ${pos}`)
        if (pos != null && pos >= 0) {
            this.playing = true
            this.pos = pos
            this.updated = now()
            this.broadcast(senderID)
            this.notify(senderID, `Play`)
        }
    }

    seek(senderID, pos) {
        console.log(`[${this.name}] seek(${pos})`)
        if (pos != null && pos >= 0) {
            this.pos = pos
            this.updated = now()
            this.broadcast(senderID)
            this.notify(senderID, `Seek ${prettyPos(pos)}`)
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
