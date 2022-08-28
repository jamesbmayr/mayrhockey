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
	
		/* elements */
			var ELEMENTS = {
				body: document.body,
				canvas: document.querySelector("#arena"),
				context: document.querySelector("#arena").getContext("2d"),
				setup: {
					element: document.querySelector("#setup"),
					launch: document.querySelector("#setup-launch"),
					time: document.querySelector("#setup-time"),
					pucks: document.querySelector("#setup-pucks"),
					goal: document.querySelector("#setup-goal")
				},
				again: {
					element: document.querySelector("#again"),
					message: document.querySelector("#again-message")
				}
			}
			window.ELEMENTS = ELEMENTS

		/* constants */
			var CONSTANTS = {
				second: 1000,
				circleRadians: Math.PI * 2,
				circleDegrees: 360,
				radiansConversion: Math.PI / 180,
				loopTime: 50,
				fadeTime: 1000,
				rounding: 100
			}

		/* game */
			var INTERACTED = false
			var PLAYERID = null
			var GAME = null
			var GAMELOOP = setInterval(displayGame, CONSTANTS.loopTime)

	/*** tools ***/
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
						window.TOAST.innerHTML = data.message
						window.TOAST.setAttribute("success", data.success || false)
						window.TOAST.setAttribute("visibility", true)

					// hide
						window.TOASTTIME = setTimeout(function() {
							window.TOAST.setAttribute("visibility", false)
						}, 5000)
				} catch (error) {console.log(error)}
			}

	/*** socket ***/
		/* start */
			var SOCKET = null
			var SOCKETCHECK = null
			var PINGINTERVAL = 60 * 1000
			checkSocket()

		/* checkSocket */
			function checkSocket() {
				createSocket()
				SOCKETCHECK = setInterval(function() {
					try {
						if (!SOCKET) {
							try {
								createSocket()
							}
							catch (error) {console.log(error)}
						}
						else {
							clearInterval(SOCKETCHECK)
						}
					}
					catch (error) {console.log(error)}
				}, 5000)
			}

		/* createSocket */
			function createSocket() {
				try {
					SOCKET = new WebSocket(location.href.replace("http","ws"))
					SOCKET.onopen = function() {
						SOCKET.send(null)
					}
					SOCKET.onerror = function(error) {
						showToast({success: false, message: error})
					}
					SOCKET.onclose = function() {
						showToast({success: false, message: "disconnected"})
						SOCKET = null
						checkSocket()
					}
					SOCKET.onmessage = function(message) {
						try {
							var post = JSON.parse(message.data)
							if (post && (typeof post == "object")) {
								receiveSocket(post)
							}
						}
						catch (error) {console.log(error)}
					}

					if (SOCKET.pingLoop) {
						clearInterval(SOCKET.pingLoop)
					}
					SOCKET.pingLoop = setInterval(function() {
						fetch("/ping", {method: "GET"})
							.then(function(response){ return response.json() })
							.then(function(data) {})
					}, PINGINTERVAL)
				}
				catch (error) {console.log(error)}
			}

		/* receiveSocket */
			function receiveSocket(data) {
				try {
					// meta
						// redirect
							if (data.location) {
								window.location = data.location
								return
							}
							
						// failure
							if (!data || !data.success) {
								showToast({success: false, message: data.message || "unknown websocket error"})
								return
							}

						// toast
							if (data.message) {
								showToast(data)
							}

					// data
						// player id
							if (data.playerId !== undefined) {
								PLAYERID = data.playerId
							}

						// audio // ???
							// if (data.audio) {
							// 	preloadAudio(data.audio)
							// }

						// launch
							if (data.launch) {
								ELEMENTS.body.setAttribute("mode", "game")
							}

						// game data
							if (data.game) {
								receiveGame(data.game)
							}
				} catch (error) {console.log(error)}
			}

	/*** game ***/
		/* receiveGame */
			function receiveGame(data) {
				try {
					// no game yet
						if (!GAME) {
							GAME = data
						}

					// update status
						if (data.status) {
							GAME.status = data.status

							if (!data.status.startTime) {
								ELEMENTS.body.setAttribute("mode", "setup")
							}

							if (data.status.endTime) {
								ELEMENTS.body.setAttribute("mode", "gameover")
								ELEMENTS.again.message.innerText = data.status.message.toUpperCase() || "GAME OVER"
							}
						}

					// update settings
						if (data.settings) {
							GAME.settings = data.settings

							if (!GAME.status.startTime) {
								if (document.activeElement !== ELEMENTS.setup.time) {
									ELEMENTS.setup.time.value = Math.floor(GAME.settings.gameTime / CONSTANTS.second)
								}
								if (document.activeElement !== ELEMENTS.setup.pucks) {
									ELEMENTS.setup.pucks.value = GAME.settings.puckCountMaximum
								}
								if (document.activeElement !== ELEMENTS.setup.goal) {
									ELEMENTS.setup.goal.value = GAME.settings.arenaWedgeAngleGoalChange
								}
							}
						}

					// update pucks
						if (data.pucks) {
							GAME.pucks = data.pucks
						}

					// update players
						if (data.players) {
							GAME.players = data.players
						}
				} catch (error) {console.log(error)}
			}

		/* displayGame */
			function displayGame() {
				try {
					// no game
						if (!GAME) {
							return
						}

					// draw canvas
						drawGame(ELEMENTS.canvas, ELEMENTS.context, GAME, GAME.players[PLAYERID])

					// update sounds // ???
						// updateSFX(GAME.players[PLAYERID])

					// done
						if (GAME.status.endTime) {
							clearInterval(GAMELOOP)

							// stop sfx / game music // ???
								// if (INTERACTED) {
									// for (var i in ELEMENTS.audio) {
									// 	for (var j in ELEMENTS.audio[i].tracks) {
									// 		ELEMENTS.audio[i].tracks[j].pause()
									// 	}
									// }

									// ELEMENTS.audio.musicMenu.tracks._1.play()
								// }
						}
				} catch (error) {console.log(error)}
			}
	
	/*** interaction ***/
		/* launchGame */
			ELEMENTS.setup.time.addEventListener("change", changeSetting)
			ELEMENTS.setup.pucks.addEventListener("change", changeSetting)
			ELEMENTS.setup.goal.addEventListener("change", changeSetting)
			function changeSetting(event) {
				try {
					// set interacted
						INTERACTED = true

					// not a player
						if (!PLAYERID || !GAME.players[PLAYERID]) {
							return false
						}

					// send update
						SOCKET.send(JSON.stringify({
							action: "changeSetting",
							playerId: PLAYERID,
							gameId: GAME.id,
							setting: event.target.id.split("-")[1] || null,
							value: Number(event.target.value) || null
						}))
				} catch (error) {console.log(error)}
			}

		/* launchGame */
			ELEMENTS.setup.launch.addEventListener("submit", launchGame)
			function launchGame(event) {
				try {
					// set interacted
						INTERACTED = true

					// not a player
						if (!PLAYERID || !GAME.players[PLAYERID]) {
							return false
						}

					// send update
						SOCKET.send(JSON.stringify({
							action: "launchGame",
							playerId: PLAYERID,
							gameId: GAME.id
						}))
				} catch (error) {console.log(error)}
			}

		/* moveMouse */
			window.addEventListener(TRIGGERS.mousemove, moveMouse)
			function moveMouse(event) {
				try {
					// no game or not started
						if (!GAME || !GAME.status.startTime) {
							return
						}

					// game over
						if (GAME.status.endTime) {
							return
						}

					// not a player
						if (!PLAYERID || !GAME.players[PLAYERID]) {
							return false
						}

					// get coordinates
						var x = (event.touches ? event.touches[0].clientX : event.clientX)
						var y = (event.touches ? event.touches[0].clientY : event.clientY)
							x = (window.innerWidth / 2) - x
							y = (window.innerHeight / 2) - y

					// get distance from center
						SOCKET.send(JSON.stringify({
							action: "moveMouse",
							playerId: PLAYERID,
							gameId: GAME.id,
							position: {
								x: x,
								y: y
							}
						}))
				} catch (error) {console.log(error)}
			}

	/*** canvas tools ***/
		/* resizeCanvas */
			resizeCanvas()
			window.addEventListener(TRIGGERS.resize, resizeCanvas)
			function resizeCanvas(event) {
				try {
					// update canvas
						ELEMENTS.canvas.height = window.innerHeight
						ELEMENTS.canvas.width = window.innerWidth
				} catch (error) {console.log(error)}
			}

		/* clearCanvas */
			function clearCanvas(canvas, context) {
				try {
					// clear
						context.clearRect(0, 0, canvas.width, canvas.height)
				} catch (error) {console.log(error)}
			}

		/* translateCanvas */
			function translateCanvas(canvas, context, options) {
				try {
					// offset
						var offsetX = (options ? options.x : 0) || 0
						var offsetY = (options ? options.y : 0) || 0

					// center canvas
						context.translate(offsetX, -1 * offsetY)
				} catch (error) {console.log(error)}
			}

		/* rotateCanvas */
			function rotateCanvas(canvas, context, options, callback) {
				try {
					// rotate
						context.translate(options.x, options.y)
						context.rotate(options.a * CONSTANTS.radiansConversion)
						context.translate(-options.x, -options.y)

					// do whatever
						callback()

					// rotate back
						context.translate(options.x, options.y)
						context.rotate(-options.a * CONSTANTS.radiansConversion)
						context.translate(-options.x, -options.y)
				} catch (error) {console.log(error)}
			}

		/* drawCircle */
			function drawCircle(canvas, context, options) {
				try {
					// parameters
						options = options || {}
						context.beginPath()
						context.fillStyle   = options.color || "transparent"
						context.strokeStyle = options.color || "transparent"
						context.lineWidth   = options.border || 0
						context.shadowBlur  = options.blur ? options.blur : 0
						context.shadowColor = options.shadow ? options.shadow : "transparent"
						context.globalAlpha = options.opacity !== undefined ? options.opacity : 1

					// draw
						if (options.clip) {
							context.arc(options.x, canvas.height - options.y, options.radius, (options.start || 0), (options.end || CONSTANTS.circleRadians))
							context.clip()
						}
						else if (options.border) {
							context.arc(options.x, canvas.height - options.y, options.radius, (options.start || 0), (options.end || CONSTANTS.circleRadians))
							context.stroke()
						}
						else {
							context.moveTo(options.x, canvas.height - options.y)
							context.arc(options.x, canvas.height - options.y, options.radius, (options.start || 0), (options.end || CONSTANTS.circleRadians))
							context.closePath()
							context.fill()
						}
				} catch (error) {console.log(error)}
			}

		/* drawText */
			function drawText(canvas, context, options) {
				try {
					// parameters
						options = options || {}
						context.beginPath()
						context.fillStyle   = options.color || "transparent"
						context.shadowBlur  = options.blur ? options.blur : 0
						context.shadowColor = options.shadow ? options.shadow : "transparent"
						context.globalAlpha = options.opacity !== undefined ? options.opacity : 1
						context.font        = (options.fontSize ? options.fontSize : 10) + "px " + (options.font ? options.font : "sans-serif")
						context.textAlign   = options.textAlign ? options.textAlign : "center"
						context.textBaseline= "middle"

					// draw
						context.fillText(options.text, options.x, canvas.height - options.y)
				} catch (error) {console.log(error)}
			}

	/*** canvas content ***/
		/* drawGame */
			function drawGame(canvas, context, game, player) {
				try {
					// clear canvas
						clearCanvas(canvas, context)

					// image dimensions
						var offsetX = canvas.width / 2
						var offsetY = canvas.height / 2

					// adjust center to camera
						translateCanvas(canvas, context, {
							x: offsetX,
							y: offsetY
						})

					// rotate around goal
						rotateCanvas(canvas, context, {
							x: 0,
							y: canvas.height,
							a: player ? player.goal.centerAngle + (CONSTANTS.circleDegrees / 4) : 0
						}, function() {
							// draw background
								drawCircle(canvas, context, {
									color: game.settings.arenaBackgroundColor,
									opacity: game.settings.arenaBackgroundOpacity,
									x: 0,
									y: 0,
									radius: game.settings.arenaRadius
								})

							// draw players
								for (var i in game.players) {
									drawGoal(canvas, context, game, game.players[i])
								}

							// draw players
								for (var i in game.players) {
									drawPlayer(canvas, context, game, game.players[i])
								}

							// draw pucks
								for (var i in game.pucks) {
									drawPuck(canvas, context, game, game.pucks[i])
								}

							// draw center
								drawCircle(canvas, context, {
									color: game.settings.arenaCenterBackgroundColor,
									opacity: game.settings.arenaCenterOpacity,
									x: 0,
									y: 0,
									radius: game.settings.arenaCenterRadius
								})

							// clip
								drawCircle(canvas, context, {
									color: game.settings.arenaBackgroundColor,
									opacity: game.settings.arenaBackgroundOpacity,
									x: 0,
									y: 0,
									radius: game.settings.arenaRadius,
									clip: true
								})
						})

					// readjust center for next loop
						translateCanvas(canvas, context, {
							x: -offsetX,
							y: -offsetY
						})

					// message
						if (game.status.message) {
							drawText(canvas, context, {
								x: canvas.width / 2,
								y: canvas.height / 2,
								text: game.status.message,
								color: game.settings.textColor,
								opacity: game.settings.textOpacity,
								fontSize: game.settings.textSize
							})
						}

					// game over?
						if (game.status.timeRemaining <= 0) {
							return
						}

					// timer
						if (!game.status.message) {
							drawText(canvas, context, {
								x: canvas.width / 2,
								y: canvas.height / 2,
								text: Math.floor(game.status.timeRemaining / CONSTANTS.second),
								color: game.settings.textColor,
								opacity: game.settings.textOpacity,
								fontSize: game.settings.textSize
							})
						}
				} catch (error) {console.log(error)}
			}

		/* drawPuck */
			function drawPuck(canvas, context, game, puck) {
				try {
					// outline
						drawCircle(canvas, context, {
							x: puck.position.x,
							y: puck.position.y,
							border: game.settings.puckBorderWidth,
							radius: game.settings.puckRadius,
							color: game.settings.puckBorderColor,
							opacity: game.settings.puckBorderOpacity,
							shadow: game.settings.puckGlowColor,
							blur: game.settings.puckGlowBlur
						})

					// wedges
						for (var i = 0; i < puck.colors.length; i++) {
							drawCircle(canvas, context, {
								x: puck.position.x,
								y: puck.position.y,
								radius: game.settings.puckRadius,
								color: game.settings.playerColors[puck.colors[i]][0],
								opacity: game.settings.puckOpacity,
								start: i * (CONSTANTS.circleRadians / puck.colors.length),
								end: (i + 1) * (CONSTANTS.circleRadians / puck.colors.length)
							})
						}
				} catch (error) {console.log(error)}
			}

		/* drawPlayer */
			function drawPlayer(canvas, context, game, player) {
				try {
					// outer circle
						drawCircle(canvas, context, {
							x: player.position.x,
							y: player.position.y,
							radius: game.settings.playerRadius,
							color: game.settings.playerColors[player.color][0],
							opacity: game.settings.playerOpacity,
							shadow: game.settings.playerGlowColor,
							blur: game.settings.playerGlowBlur
						})
				} catch (error) {console.log(error)}
			}

		/* drawGoal */
			function drawGoal(canvas, context, game, player) {
				try {
					// inner circle
						drawCircle(canvas, context, {
							x: 0,
							y: 0,
							radius: game.settings.arenaRadius,
							color: game.settings.playerColors[player.color][1],
							opacity: game.settings.arenaWedgeOpacity,
							start: -(player.goal.centerAngle + (player.goal.angularWidth / 2)) * CONSTANTS.radiansConversion,
							end:   -(player.goal.centerAngle - (player.goal.angularWidth / 2)) * CONSTANTS.radiansConversion,
						})

					// outer circle
						drawCircle(canvas, context, {
							x: 0,
							y: 0,
							radius: game.settings.arenaRadius,
							color: game.settings.playerColors[player.color][2],
							opacity: game.settings.arenaBorderOpacity,
							start: (player.goal.centerAngle - (player.goal.angularWidth / 2)) * CONSTANTS.radiansConversion,
							end:   (player.goal.centerAngle + (player.goal.angularWidth / 2)) * CONSTANTS.radiansConversion,
							border: game.settings.arenaBorderWidth,
							shadow: game.settings.arenaWedgeGlowColor,
							blur: game.settings.arenaWedgeGlowBlur
						})
				} catch (error) {console.log(error)}
			}

	/*** audio ***/
		/* preloadAudio */
			// function preloadAudio(soundNames) {
			// 	try {
			// 		// loop through all soundNames
			// 			for (var i in soundNames) {
			// 				// get file name
			// 					var info = soundNames[i].split("_")
			// 					var soundName = info[0]
			// 					var loopDuration = info[1] && Number(info[1]) ? (Number(info[1]) / CONSTANTS.loopTime - 1) : null
			// 					var fadePerLoop = info[2] && Number(info[2]) ? (CONSTANTS.loopTime / Number(info[2])) : (CONSTANTS.loopTime / CONSTANTS.fadeTime)
			// 						fadePerLoop = fadePerLoop * CONSTANTS.audioVolume
			// 					var version = Number(info[3]) || 1

			// 				// create audio element that loops this file
			// 					var audioElement = new Audio()
			// 						audioElement.loop = soundName.includes("music") ? true : false
			// 						audioElement.src = "/assets/" + soundNames[i] + ".mp3"
			// 						audioElement.volume = CONSTANTS.audioVolume

			// 				// add to list of audio objects
			// 					if (!ELEMENTS.audio[soundName]) {
			// 						ELEMENTS.audio[soundName] = {
			// 							fadePerLoop: fadePerLoop,
			// 							loopDuration: loopDuration,
			// 							remainingLoops: 0,
			// 							activeTrack: null,
			// 							tracks: {}
			// 						}
			// 					}

			// 				// add to list of versions for that audio effect
			// 					ELEMENTS.audio[soundName].tracks["_" + version] = audioElement
			// 			}
			// 	} catch (error) {console.log(error)}
			// }

		/* updateSFX */
			// function updateSFX(player) {
			// 	try {
			// 		// not interacted yet --> browsers block autoplay
			// 			if (!INTERACTED) {
			// 				return
			// 			}

			// 		// play music
			// 			if (ELEMENTS.audio.musicGame && ELEMENTS.audio.musicGame.tracks._1.paused) {
			// 				ELEMENTS.audio.musicMenu.tracks._1.pause()
			// 				// ELEMENTS.audio.musicGame.tracks._1.play() // ??? no game music yet
			// 			}

			// 		// not a player
			// 			if (!PLAYERID || !player) {
			// 				return false
			// 			}

			// 		// loop through soundNames on player object
			// 			for (var soundName in player.status.sfx) {
			// 				// get current status (true / false)
			// 					var status = player.status.sfx[soundName]

			// 				// audio object not found
			// 					if (!ELEMENTS.audio[soundName]) {
			// 						continue
			// 					}

			// 				// should be playing
			// 					if (status == true) {
			// 						// already playing --> keep playing (on a loop)
			// 							if (ELEMENTS.audio[soundName].activeTrack) {
			// 								// not time to switch tracks
			// 									if (ELEMENTS.audio[soundName].remainingLoops) {
			// 										ELEMENTS.audio[soundName].remainingLoops--
			// 										continue
			// 									}
											
			// 								// infinite duration --> keep playing
			// 									if (!ELEMENTS.audio[soundName].loopDuration) {
			// 										continue
			// 									}

			// 								// multiple versions --> choose a random one
			// 									var previousTrackKey = ELEMENTS.audio[soundName].activeTrack
			// 									ELEMENTS.audio[soundName].tracks[previousTrackKey].volume = 0
			// 									ELEMENTS.audio[soundName].tracks[previousTrackKey].pause()

			// 									var trackKeys = Object.keys(ELEMENTS.audio[soundName].tracks)
			// 									var newTrackKey = trackKeys[Math.floor(Math.random() * trackKeys.length)]

			// 									ELEMENTS.audio[soundName].activeTrack = newTrackKey
			// 									ELEMENTS.audio[soundName].remainingLoops = ELEMENTS.audio[soundName].loopDuration
			// 									ELEMENTS.audio[soundName].tracks[newTrackKey].volume = CONSTANTS.audioVolume
			// 									ELEMENTS.audio[soundName].tracks[newTrackKey].currentTime = 0
			// 									ELEMENTS.audio[soundName].tracks[newTrackKey].play()
			// 									continue
			// 							}

			// 						// start from beginning at full volume
			// 							// random from versions
			// 								var trackKeys = Object.keys(ELEMENTS.audio[soundName].tracks)
			// 								var trackKey = trackKeys[Math.floor(Math.random() * trackKeys.length)]

			// 							// start
			// 								ELEMENTS.audio[soundName].activeTrack = trackKey
			// 								ELEMENTS.audio[soundName].remainingLoops = ELEMENTS.audio[soundName].loopDuration
			// 								ELEMENTS.audio[soundName].tracks[trackKey].volume = CONSTANTS.audioVolume
			// 								ELEMENTS.audio[soundName].tracks[trackKey].currentTime = 0
			// 								ELEMENTS.audio[soundName].tracks[trackKey].play()
			// 								continue
			// 					}

			// 				// should not be playing
			// 					if (status == false) {
			// 						// get active track
			// 							var trackKey = ELEMENTS.audio[soundName].activeTrack

			// 						// already stopped
			// 							if (!trackKey) {
			// 								continue
			// 							}

			// 						// volume is 0 --> stop
			// 							if (ELEMENTS.audio[soundName].tracks[trackKey].volume <= ELEMENTS.audio[soundName].fadePerLoop) {
			// 								ELEMENTS.audio[soundName].tracks[trackKey].volume = 0
			// 								ELEMENTS.audio[soundName].tracks[trackKey].pause()
			// 								ELEMENTS.audio[soundName].activeTrack = null
			// 								continue
			// 							}

			// 						// still going --> decrease volume
			// 							ELEMENTS.audio[soundName].tracks[trackKey].volume -= ELEMENTS.audio[soundName].fadePerLoop
			// 							continue
			// 					}
			// 			}
			// 	} catch (error) {console.log(error)}
			// }
})