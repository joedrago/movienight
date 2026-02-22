// --------------------------------------------------------------------------------------
// Gamepad

class GamepadListener {
    constructor(onButton) {
        this.onButton = onButton
        this.prevState = {}
        this.animFrame = null
        this.running = false

        if (!navigator.getGamepads) {
            console.error("Gamepad API not supported in this browser")
            return
        }
        console.log("Gamepad API supported. Press a button on your gamepad to connect it.")

        window.addEventListener("gamepadconnected", (e) => {
            console.log("Gamepad connected:", e.gamepad.id, "mapping:", e.gamepad.mapping)
            this.start()
        })
        window.addEventListener("gamepaddisconnected", () => {
            console.log("Gamepad disconnected")
            this.stop()
        })
        // Check for already-connected gamepads
        for (const gp of navigator.getGamepads()) {
            if (gp) {
                console.log("Gamepad already present:", gp.id, "mapping:", gp.mapping)
                this.start()
                break
            }
        }
        this.start()
    }

    start() {
        if (this.running) {
            return
        }
        this.running = true
        console.log("GamepadListener polling started")
        this.poll()
    }

    stop() {
        this.running = false
        if (this.animFrame) {
            cancelAnimationFrame(this.animFrame)
            this.animFrame = null
        }
    }

    poll() {
        if (!this.running) {
            return
        }
        const gamepads = navigator.getGamepads()
        for (const gp of gamepads) {
            if (!gp) continue
            const id = gp.index

            // Face buttons (A=0, B=1, X=2, Y=3 on standard mapping)
            const faceNames = ["a", "b", "x", "y"]
            for (let i = 0; i < 4; i++) {
                const pressed = gp.buttons[i]?.pressed
                const key = `${id}-btn-${i}`
                if (pressed && !this.prevState[key]) {
                    this.onButton(faceNames[i])
                }
                this.prevState[key] = pressed
            }

            // D-pad (buttons 12-15 on standard mapping)
            const dpadNames = ["up", "down", "left", "right"]
            for (let i = 0; i < 4; i++) {
                const pressed = gp.buttons[12 + i]?.pressed
                const key = `${id}-dpad-${i}`
                if (pressed && !this.prevState[key]) {
                    this.onButton(dpadNames[i])
                }
                this.prevState[key] = pressed
            }
        }
        if (this.running) {
            this.animFrame = requestAnimationFrame(() => this.poll())
        }
    }
}

// --------------------------------------------------------------------------------------
// Overlay List

class OverlayList {
    constructor(onHide) {
        this.items = []
        this.selectedIndex = 0
        this.onSelect = null
        this.onCancel = null
        this.onHide = onHide || null
        this.gamepad = null

        this.overlay = document.createElement("div")
        this.overlay.style.position = "fixed"
        this.overlay.style.top = "0"
        this.overlay.style.left = "0"
        this.overlay.style.width = "100%"
        this.overlay.style.height = "100%"
        this.overlay.style.backgroundColor = "rgba(0, 0, 0, 0.8)"
        this.overlay.style.display = "none"
        this.overlay.style.justifyContent = "center"
        this.overlay.style.alignItems = "center"
        this.overlay.style.zIndex = "100"
        this.overlay.tabIndex = 0

        this.list = document.createElement("div")
        this.list.style.maxHeight = "80%"
        this.list.style.overflowY = "auto"
        this.list.style.padding = "20px"
        this.list.style.backgroundColor = "#222"
        this.list.style.borderRadius = "8px"
        this.list.style.minWidth = "300px"

        this.overlay.appendChild(this.list)
        document.body.appendChild(this.overlay)

        this.overlay.addEventListener("keydown", (e) => this.handleKeyDown(e))
    }

    show(items, onSelect, onCancel) {
        this.items = items
        this.selectedIndex = 0
        this.onSelect = onSelect
        this.onCancel = onCancel

        this.gamepad = new GamepadListener((btn) => this.handleGamepadButton(btn))

        this.render()
        this.overlay.style.display = "flex"
        this.overlay.focus()
    }

    hide() {
        this.overlay.style.display = "none"
        if (this.gamepad) {
            this.gamepad.stop()
            this.gamepad = null
        }
        if (this.onHide) {
            this.onHide()
        }
    }

    moveUp() {
        if (this.items.length === 0) {
            return
        }
        this.selectedIndex = (this.selectedIndex - 1 + this.items.length) % this.items.length
        this.render()
    }

    moveDown() {
        if (this.items.length === 0) {
            return
        }
        this.selectedIndex = (this.selectedIndex + 1) % this.items.length
        this.render()
    }

    selectItem() {
        if (this.items.length === 0) {
            return
        }
        const selected = this.items[this.selectedIndex]
        this.hide()
        if (this.onSelect) {
            this.onSelect(selected)
        }
    }

    cancel() {
        this.hide()
        if (this.onCancel) {
            this.onCancel()
        }
    }

    render() {
        this.list.innerHTML = ""
        this.items.forEach((item, index) => {
            const el = document.createElement("div")
            el.textContent = item
            el.style.padding = "10px 20px"
            el.style.cursor = "pointer"
            el.style.borderRadius = "4px"
            el.style.marginBottom = "4px"
            if (index === this.selectedIndex) {
                el.style.backgroundColor = "#4a4a4a"
                el.style.color = "#fff"
            } else {
                el.style.backgroundColor = "transparent"
                el.style.color = "#aaa"
            }
            this.list.appendChild(el)
        })

        // Scroll selected item into view
        const selectedEl = this.list.children[this.selectedIndex]
        if (selectedEl) {
            selectedEl.scrollIntoView({ block: "nearest" })
        }
    }

    handleKeyDown(e) {
        switch (e.key) {
            case "ArrowUp":
                e.preventDefault()
                this.moveUp()
                break
            case "ArrowDown":
                e.preventDefault()
                this.moveDown()
                break
            case "Enter":
            case " ":
                e.preventDefault()
                this.selectItem()
                break
            case "Escape":
                e.preventDefault()
                this.cancel()
                break
        }
    }

    handleGamepadButton(btn) {
        switch (btn) {
            case "up":
                this.moveUp()
                break
            case "down":
                this.moveDown()
                break
            case "a":
                this.selectItem()
                break
            case "b":
                this.cancel()
                break
        }
    }
}
