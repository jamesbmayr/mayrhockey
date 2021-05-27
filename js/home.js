window.addEventListener("load", function() {
	/*** globals ***/
		/* triggers */
			window.TRIGGERS = {
				submit: "submit",
				change: "change",
				input: "input",
				focus: "focus",
				blur: "blur",
				resize: "resize",
				keydown: "keydown",
				keyup: "keyup"
			}
			if ((/Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i).test(navigator.userAgent)) {
				window.TRIGGERS.click = "touchstart"
				window.TRIGGERS.mousedown = "touchstart"
				window.TRIGGERS.mousemove = "touchmove"
				window.TRIGGERS.mouseup = "touchend"
				window.TRIGGERS.mouseenter = "touchstart"
				window.TRIGGERS.mouseleave = "touchend"
				window.TRIGGERS.rightclick = "contextmenu"
			}
			else {
				window.TRIGGERS.click = "click"
				window.TRIGGERS.mousedown = "mousedown"
				window.TRIGGERS.mousemove = "mousemove"
				window.TRIGGERS.mouseup = "mouseup"
				window.TRIGGERS.mouseenter = "mouseenter"
				window.TRIGGERS.mouseleave = "mouseleave"
				window.TRIGGERS.rightclick = "contextmenu"
			}

		/* defaults */
			document.addEventListener("dblclick", function(event) {
				event.preventDefault()
			})

			document.addEventListener("contextmenu", function(event) {
				event.preventDefault()
			})

	/*** constants ***/
		/* elements */
			var ELEMENTS = {
				newGameForm: document.querySelector("#new-game-form"),
				newGameButton: document.querySelector("#new-game-button"),
				joinGameForm: document.querySelector("#join-game-form"),
				gameIdInput: document.querySelector("#game-id-input"),
				joinGameButton: document.querySelector("#join-game-button"),
				puckZone: document.querySelector("#puck-zone"),
				pucks: []
			}

		/* settings */
			var CONSTANTS = {
				circleDegrees: 360,
				radiansConversion: Math.PI / 180,
				largeMultiplier: 1000000000000,
				puckCount: 24,
				puckVelocityMinimum: 6,
				puckVelocityMaximum: 12,
				puckEdge: 100,
				puckLoopTime: 50
			}

	/*** tools ***/
		/* sendPost */
			function sendPost(options, callback) {
				try {
					// create request object and send to server
						var request = new XMLHttpRequest()
							request.open("POST", location.pathname, true)
							request.onload = function() {
								if (request.readyState !== XMLHttpRequest.DONE || request.status !== 200) {
									callback({success: false, readyState: request.readyState, message: request.status})
									return
								}
								
								callback(JSON.parse(request.responseText) || {success: false, message: "unknown error"})
							}
							request.send(JSON.stringify(options))
				} catch (error) {console.log(error)}
			}

		/* receivePost */
			function receivePost(data) {
				try {
					// redirect
						if (data.location) {
							window.location = data.location
							return
						}

					// message
						if (data.message) {
							showToast(data)
						}
				} catch (error) {console.log(error)}
			}

		/* isNumLet */
			function isNumLet(string) {
				try {
					return (/^[a-zA-Z0-9]+$/).test(string)
				} catch (error) {console.log(error)}
			}

		/* showToast */
			window.TOASTTIME = null
			function showToast(data) {
				try {
					// clear existing countdowns
						if (window.TOASTTIME) {
							clearTimeout(window.TOASTTIME)
							window.TOASTTIME = null
						}

					// append
						if (!window.TOAST) {
							window.TOAST = document.createElement("div")
							window.TOAST.id = "toast"
							window.TOAST.setAttribute("visibility", false)
							window.TOAST.setAttribute("success", false)
							document.body.appendChild(window.TOAST)
						}

					// show
						setTimeout(function() {
							window.TOAST.innerHTML = data.message
							window.TOAST.setAttribute("success", data.success || false)
							window.TOAST.setAttribute("visibility", true)
						}, 200)

					// hide
						window.TOASTTIME = setTimeout(function() {
							window.TOAST.setAttribute("visibility", false)
						}, 5000)
				} catch (error) {console.log(error)}
			}

	/*** submits ***/
		/* submitNewGame */
			ELEMENTS.newGameForm.addEventListener(window.TRIGGERS.submit, submitNewGame)
			function submitNewGame(event) {
				try {
					// post
						sendPost({
							action: "createGame",
						}, receivePost)
				} catch (error) {console.log(error)}
			}

		/* submitJoinGame */
			ELEMENTS.joinGameForm.addEventListener(window.TRIGGERS.submit, submitJoinGame)
			function submitJoinGame(event) {
				try {
					// validation
						var gameId = ELEMENTS.gameIdInput.value || null
						if (!gameId || gameId.length !== 4 || !isNumLet(gameId)) {
							showToast({success: false, message: "game id must be 4 letters & numbers"})
							return
						}

					// post
						sendPost({
							action: "joinGame",
							gameId: gameId
						}, receivePost)
				} catch (error) {console.log(error)}
			}

	/*** pucks ***/
		/* createPuck */
			function createPuck() {
				try {
					// only sometimes
						if (Math.floor(Math.random() * 2)) {
							return
						}

					// velocity
						var velocity = Math.floor(Math.random() * (CONSTANTS.puckVelocityMaximum - CONSTANTS.puckVelocityMinimum)) + CONSTANTS.puckVelocityMinimum
						var angle = Math.floor(Math.random() * CONSTANTS.circleDegrees) * CONSTANTS.radiansConversion

					// new element
						var puck = document.createElement("div")
							puck.id = "puck-" + Math.floor(Math.random() * CONSTANTS.largeMultiplier).toString(16)
							puck.className = "puck"
							puck.style.left = (window.innerWidth  / 2) + "px"
							puck.style.top  = (window.innerHeight) / 2 + "px"
							puck.setAttribute("vx", Math.cos(angle) * velocity)
							puck.setAttribute("vy", Math.sin(angle) * velocity)
						ELEMENTS.puckZone.appendChild(puck)
						ELEMENTS.pucks[puck.id] = puck
				} catch (error) {console.log(error)}
			}

		/* movePucks */
			var PUCKLOOP = setInterval(movePucks, CONSTANTS.puckLoopTime)
			function movePucks() {
				try {
					// not enough
						if (Object.keys(ELEMENTS.pucks).length < CONSTANTS.puckCount) {
							createPuck()
						}

					// move
						for (var i in ELEMENTS.pucks) {
							// get position
								var puck = ELEMENTS.pucks[i]
								var currentX = Number(puck.style.left.replace("px", ""))
								var currentY = Number(puck.style.top.replace("px",  ""))

							// out of bounds
								if (currentX < -CONSTANTS.puckEdge || currentX > CONSTANTS.puckEdge + window.innerWidth) {
									ELEMENTS.pucks[i].remove()
									delete ELEMENTS.pucks[i]
									continue
								}
								if (currentY < -CONSTANTS.puckEdge || currentY > CONSTANTS.puckEdge + window.innerHeight) {
									ELEMENTS.pucks[i].remove()
									delete ELEMENTS.pucks[i]
									continue
								}

							// update position
								var vx = Number(puck.getAttribute("vx"))
								var vy = Number(puck.getAttribute("vy"))
								puck.style.left = (currentX + vx) + "px"
								puck.style.top  = (currentY + vy) + "px"
						}
				} catch (error) {console.log(error)}
			}
})
