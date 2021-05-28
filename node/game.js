/*** modules ***/
	if (!CORE) { var CORE = require("../node/core") }
	if (!SESSION) { var SESSION = require("../node/session") }
	module.exports = {}

/*** constants ***/
	var CONSTANTS = CORE.getAsset("constants")

/*** creates ***/
	/* createOne */
		module.exports.createOne = createOne
		function createOne(REQUEST, callback) {
			try {
				// create
					var game = CORE.getSchema("game")

					var player = CORE.getSchema("player")
						player.sessionId = REQUEST.session.id
						player.color = CORE.chooseRandom(Object.keys(game.settings.playerColors))
					game.players[player.id] = player

				// query
					var query = CORE.getSchema("query")
						query.collection = "games"
						query.command = "insert"
						query.document = game

				// insert
					CORE.accessDatabase(query, function(results) {
						if (!results.success) {
							callback(results)
							return
						}

						// update session
							REQUEST.updateSession = {
								playerId: player.id,
								gameId: game.id
							}
							SESSION.updateOne(REQUEST, null, function() {
								// redirect
									callback({success: true, message: "game created", location: "../game/" + game.id})
							})
					})
			}
			catch (error) {
				CORE.logError(error)
				callback({success: false, message: "unable to " + arguments.callee.name, recipients: [REQUEST.session.id]})
			}
		}

	/* joinOne */
		module.exports.joinOne = joinOne
		function joinOne(REQUEST, callback) {
			try {
				// validate
					if (!REQUEST.post.gameId || REQUEST.post.gameId.length !== CONSTANTS.gameIdLength || !CORE.isNumLet(REQUEST.post.gameId)) {
						callback({success: false, message: "gameId must be " + CONSTANTS.gameIdLength + " letters and numbers"})
						return
					}

				// query
					REQUEST.post.gameId = REQUEST.post.gameId.toLowerCase()
					var query = CORE.getSchema("query")
						query.collection = "games"
						query.command = "find"
						query.filters = {id: REQUEST.post.gameId}

				// find
					CORE.accessDatabase(query, function(results) {
						// not found
							if (!results.success) {
								callback({success: false, message: "no game found"})
								return
							}

						// already a player?
							var game = results.documents[0]
							var playerKeys = Object.keys(game.players)
							if (playerKeys.find(function(p) { return game.players[p].sessionId == REQUEST.session.id })) {
								callback({success: true, message: "re-joining game", location: "../game/" + game.id})
								return
							}

						// already started
							if (game.status && game.status.startTime) {
								callback({success: false, message: "game already started"})
								return
							}

						// already ended
							if (game.status && game.status.endTime) {
								callback({success: false, message: "already ended"})
								return
							}

						// player count
							if (playerKeys.length >= game.settings.playerCountMaximum) {
								callback({success: false, message: "maximum player count reached"})
								return
							}

						// remaining colors
							var existingColors = []
							for (var i in playerKeys) {
								existingColors.push(game.players[playerKeys[i]].color)
							}

							var remainingColors = Object.keys(game.settings.playerColors)
								remainingColors = remainingColors.filter(function(color) {
									return !existingColors.includes(color)
								}) || []

						// create player
							var player = CORE.getSchema("player")
								player.sessionId = REQUEST.session.id
								player.color = CORE.chooseRandom(remainingColors)

						// add to game
							game.players[player.id] = player

						// update goals
							var playerKeys = Object.keys(game.players)
							var goalSector = (CONSTANTS.circleDegrees / playerKeys.length) - game.settings.arenaWedgeAngleNeutral
							for (var i = 0; i < playerKeys.length; i++) {
								var player = game.players[playerKeys[i]]

								player.goal = {
									centerAngle: (goalSector + game.settings.arenaWedgeAngleNeutral) * i,
									angularWidth: goalSector
								}
							}

						// query
							game.updated = new Date().getTime()
							var query = CORE.getSchema("query")
								query.collection = "games"
								query.command = "update"
								query.filters = {id: game.id}
								query.document = game

						// update
							CORE.accessDatabase(query, function(results) {
								if (!results.success) {
									callback(results)
									return
								}

								// update session
									REQUEST.updateSession = {
										playerId: player.id,
										gameId: game.id
									}
									SESSION.updateOne(REQUEST, null, function() {
										// redirect
											callback({success: true, message: "game joined", location: "../game/" + game.id})
									})
							})
					})
			}
			catch (error) {
				CORE.logError(error)
				callback({success: false, message: "unable to " + arguments.callee.name, recipients: [REQUEST.session.id]})
			}
		}

/*** reads ***/
	/* readOne */
		module.exports.readOne = readOne
		function readOne(REQUEST, callback) {
			try {
				// game id
					var gameId = REQUEST.path[REQUEST.path.length - 1]

				// query
					var query = CORE.getSchema("query")
						query.collection = "games"
						query.command = "find"
						query.filters = {id: gameId}

				// find
					CORE.accessDatabase(query, function(results) {
						// not found
							if (!results.success) {
								callback({gameId: gameId, success: false, message: "no game found", location: "../../../../", recipients: [REQUEST.session.id]})
								return
							}

						// get player id
							var game = results.documents[0]
							var playerId = null
							if (Object.keys(game.players).length) {
								playerId = Object.keys(game.players).find(function(p) {
									return game.players[p].sessionId == REQUEST.session.id
								})
							}

						// new player --> send full game
							if (playerId) {
								callback({gameId: game.id, success: true, message: null, playerId: playerId, launch: (game.status.startTime ? true : false), game: game, audio: CORE.getAsset("audio"), recipients: [REQUEST.session.id]})
								return
							}

						// existing spectator
							if (game.spectators[REQUEST.session.id]) {
								callback({gameId: game.id, success: true, message: "now observing the game", playerId: null, launch: (game.status.startTime ? true : false), game: game, audio: CORE.getAsset("audio"), recipients: [REQUEST.session.id]})
								return
							}

						// new spectator
							if (!game.spectators[REQUEST.session.id]) {
								// add spectator
									game.spectators[REQUEST.session.id] = true

								// query
									game.updated = new Date().getTime()
									var query = CORE.getSchema("query")
										query.collection = "games"
										query.command = "update"
										query.filters = {id: game.id}
										query.document = {updated: game.updated, spectators: game.spectators}

								// update
									CORE.accessDatabase(query, function(results) {
										if (!results.success) {
											results.gameId = game.id
											callback(results)
											return
										}

										// for this spectator
											callback({gameId: game.id, success: true, message: "now observing the game", playerId: null, launch: (game.status.startTime ? true : false), game: game, audio: CORE.getAsset("audio"), recipients: [REQUEST.session.id]})
									})
							}
					})
			}
			catch (error) {
				CORE.logError(error)
				callback({gameId: REQUEST.path[REQUEST.path.length - 1], success: false, message: "unable to " + arguments.callee.name, recipients: [REQUEST.session.id]})
			}
		}

/*** updates ***/
	/* updateOne */
		module.exports.updateOne = updateOne
		function updateOne(REQUEST, callback) {
			try {
				// game id
					var gameId = REQUEST.path[REQUEST.path.length - 1]
					if (!gameId || gameId.length !== CONSTANTS.gameIdLength) {
						callback({gameId: gameId, success: false, message: "invalid game id", recipients: [REQUEST.session.id]})
						return
					}

				// player id
					if (!REQUEST.post || !REQUEST.post.playerId) {
						callback({gameId: gameId, success: false, message: "invalid player id", recipients: [REQUEST.session.id]})
						return
					}

				// action
					if (!REQUEST.post || !REQUEST.post.action || !["moveMouse", "launchGame", "changeSetting"].includes(REQUEST.post.action)) {
						callback({gameId: gameId, success: false, message: "invalid action", recipients: [REQUEST.session.id]})
						return
					}

				// query
					var query = CORE.getSchema("query")
						query.collection = "games"
						query.command = "find"
						query.filters = {id: gameId}

				// find
					CORE.accessDatabase(query, function(results) {
						if (!results.success) {
							callback({gameId: gameId, success: false, message: "game ended", recipients: [REQUEST.session.id]})
							return
						}

						// not a player?
							var game = results.documents[0]
							var player = game.players[REQUEST.post.playerId] || null
							if (!player) {
								callback({gameId: gameId, success: false, message: "not a player", recipients: [REQUEST.session.id]})
								return
							}

						// already ended?
							if (game.status && game.status.endTime) {
								callback({gameId: gameId, success: false, message: "game ended", recipients: [REQUEST.session.id]})
								return
							}


						// change setting
							if ("changeSetting" == REQUEST.post.action) {
								updateSetting(REQUEST, game, callback)
								return
							}

						// start game
							if ("launchGame" == REQUEST.post.action) {
								updateLaunch(REQUEST, game, callback)
								return
							}

						// cursor
							updatePlayer(REQUEST, game, player, callback)
							return
					})
			}
			catch (error) {
				CORE.logError(error)
				callback({gameId: REQUEST.path[REQUEST.path.length - 1], success: false, message: "unable to " + arguments.callee.name, recipients: [REQUEST.session.id]})
			}
		}

	/* updateSetting */
		module.exports.updateSetting = updateSetting
		function updateSetting(REQUEST, game, callback) {
			try {
				// already started?
					if (game.status && game.status.startTime) {
						callback({gameId: gameId, success: false, message: "game already started", recipients: [REQUEST.session.id]})
						return
					}

				// invalid setting
					if (!REQUEST.post.setting || !["time", "pucks", "goal"].includes(REQUEST.post.setting)) {
						callback({gameId: gameId, success: false, message: "invalid setting", recipients: [REQUEST.session.id]})
						return
					}
					if (!REQUEST.post.value || isNaN(REQUEST.post.value)) {
						callback({gameId: gameId, success: false, message: "invalid value", recipients: [REQUEST.session.id]})
						return
					}

				// update value
					if (REQUEST.post.setting == "time") {
						game.settings.gameTime = Math.floor(REQUEST.post.value * CONSTANTS.second)
					}
					if (REQUEST.post.setting == "pucks") {
						game.settings.puckCountMaximum = Math.floor(REQUEST.post.value)
					}
					if (REQUEST.post.setting == "goal") {
						game.settings.arenaWedgeAngleGoalChange = Math.floor(REQUEST.post.value)
					}

				// query
					game.updated = new Date().getTime()
					var query = CORE.getSchema("query")
						query.collection = "games"
						query.command = "update"
						query.filters = {id: game.id}
						query.document = game

				// update
					CORE.accessDatabase(query, function(results) {
						if (!results.success) {
							results.gameId = game.id
							callback(results)
							return
						}

						// recipients
							var recipients = []
							for (var i in game.players) {
								recipients.push(game.players[i].sessionId)
							}
							for (var i in game.spectators) {
								recipients.push(i)
							}

						// send game data to everyone
							callback({gameId: game.id, success: true, game: {settings: game.settings}, recipients: recipients})
					})
			}
			catch (error) {
				CORE.logError(error)
				callback({gameId: REQUEST.path[REQUEST.path.length - 1], success: false, message: "unable to " + arguments.callee.name, recipients: [REQUEST.session.id]})
			}
		}

	/* updateLaunch */
		module.exports.updateLaunch = updateLaunch
		function updateLaunch(REQUEST, game, callback) {
			try {
				// already started?
					if (game.status && game.status.startTime) {
						callback({gameId: gameId, success: false, message: "game already started", recipients: [REQUEST.session.id]})
						return
					}

				// not enough players
					if (Object.keys(game.players).length < game.settings.playerCountMinimum) {
						callback({gameId: gameId, success: false, message: "game requires at least " + game.settings.playerCountMinimum + " players", recipients: [REQUEST.session.id]})
						return
					}

				// too many players
					if (Object.keys(game.players).length > game.settings.playerCountMaximum) {
						callback({gameId: gameId, success: false, message: "game cannot have more than " + game.settings.playerCountMaximum + " players", recipients: [REQUEST.session.id]})
						return
					}

				// position players within goal areas
					for (var i in game.players) {
						game.players[i].position = getCartesianCoordinates(game.settings.arenaRadius, game.players[i].goal.centerAngle)
					}

				// set time
					game.status.timeRemaining = Number(game.settings.gameTime) + game.settings.gameLaunchDelay

				// actually start
					game.status.startTime = new Date().getTime() + game.settings.gameLaunchDelay

				// query
					game.updated = new Date().getTime()
					var query = CORE.getSchema("query")
						query.collection = "games"
						query.command = "update"
						query.filters = {id: game.id}
						query.document = game

				// update
					CORE.accessDatabase(query, function(results) {
						if (!results.success) {
							results.gameId = game.id
							callback(results)
							return
						}

						// recipients
							var recipients = []
							for (var i in game.players) {
								recipients.push(game.players[i].sessionId)
							}
							for (var i in game.spectators) {
								recipients.push(i)
							}

						// send game data to everyone
							callback({gameId: game.id, success: true, launch: true, game: game, recipients: recipients})
					})
			}
			catch (error) {
				CORE.logError(error)
				callback({gameId: REQUEST.path[REQUEST.path.length - 1], success: false, message: "unable to " + arguments.callee.name, recipients: [REQUEST.session.id]})
			}
		}

	/* updatePlayer */
		module.exports.updatePlayer = updatePlayer
		function updatePlayer(REQUEST, game, player, callback) {
			try {
				// not started
					if (!game.status || !game.status.startTime || new Date().getTime() < game.status.startTime) {
						return
					}

				// no position
					if (!REQUEST.post.position || isNaN(REQUEST.post.position.x) || isNaN(REQUEST.post.position.y)) {
						return
					}

				// get radial coordinates
					var radialCoordinates = getRadialCoordinates(REQUEST.post.position.x, REQUEST.post.position.y)
						radialCoordinates.a = ((player.goal.centerAngle - CONSTANTS.circleDegrees / 4) - radialCoordinates.a) % CONSTANTS.circleDegrees

				// out of sector
					var startAngle = ((player.goal.centerAngle - player.goal.angularWidth / 2) + CONSTANTS.circleDegrees) % CONSTANTS.circleDegrees
					var endAngle =   ((player.goal.centerAngle + player.goal.angularWidth / 2) + CONSTANTS.circleDegrees) % CONSTANTS.circleDegrees

					if (!((radialCoordinates.a - startAngle + CONSTANTS.circleDegrees) % CONSTANTS.circleDegrees < (endAngle - startAngle + CONSTANTS.circleDegrees) % CONSTANTS.circleDegrees)
					||  !((  endAngle - radialCoordinates.a + CONSTANTS.circleDegrees) % CONSTANTS.circleDegrees < (endAngle - startAngle + CONSTANTS.circleDegrees) % CONSTANTS.circleDegrees)) {
						// get angleDifferences
							var angleDifferenceFromStart = Math.abs(radialCoordinates.a - startAngle)
								angleDifferenceFromStart = Math.min(angleDifferenceFromStart, Math.abs(CONSTANTS.circleDegrees - angleDifferenceFromStart))

							var angleDifferenceFromEnd   = Math.abs(radialCoordinates.a - endAngle)
								angleDifferenceFromEnd   = Math.min(angleDifferenceFromEnd, Math.abs(CONSTANTS.circleDegrees - angleDifferenceFromEnd))

						// closer to end
							if (angleDifferenceFromEnd < angleDifferenceFromStart) {
								radialCoordinates.r = radialCoordinates.r * Math.cos(angleDifferenceFromEnd * CONSTANTS.radiansConversion)
								radialCoordinates.a = endAngle
							}

						// closer to start
							else {
								radialCoordinates.r = radialCoordinates.r * Math.cos(angleDifferenceFromStart * CONSTANTS.radiansConversion)
								radialCoordinates.a = startAngle
							}
					}

				// out of bounds
					if (radialCoordinates.r > game.settings.arenaRadius) {
						radialCoordinates.r = game.settings.arenaRadius
					}

				// in of bounds
					if (radialCoordinates.r < game.settings.arenaCenterRadius) {
						radialCoordinates.r = game.settings.arenaCenterRadius
					}

				// in sector
					var newPosition = getCartesianCoordinates(radialCoordinates.r, radialCoordinates.a)

				// update velocity
					player.velocity.x = newPosition.x - player.position.x
					player.velocity.y = newPosition.y - player.position.y

				// update position
					player.position.x = newPosition.x
					player.position.y = newPosition.y

				// query
					game.updated = new Date().getTime()
					var query = CORE.getSchema("query")
						query.collection = "games"
						query.command = "update"
						query.filters = {id: game.id}
						query.document = game

				// update
					CORE.accessDatabase(query, function(results) {
						if (!results.success) {
							results.gameId = game.id
							callback(results)
							return
						}
					})
			}
			catch (error) {
				CORE.logError(error)
				callback({gameId: REQUEST.path[REQUEST.path.length - 1], success: false, message: "unable to " + arguments.callee.name, recipients: [REQUEST.session.id]})
			}
		}

/*** deletes ***/
	/* deleteOne */
		module.exports.deleteOne = deleteOne
		function deleteOne(gameId) {
			try {
				// game id
					if (!gameId || gameId.length !== CONSTANTS.gameIdLength) {
						return
					}

				// query
					var query = CORE.getSchema("query")
						query.collection = "games"
						query.command = "delete"
						query.filters = {id: gameId}

				// find
					CORE.accessDatabase(query, function(results) {
						return
					})
			}
			catch (error) {
				CORE.logError(error)
			}
		}

/*** tools ***/
	/* getRadialCoordinates */
		module.exports.getRadialCoordinates = getRadialCoordinates
		function getRadialCoordinates(x, y) {
			try {
				// calculate
					return {
						r: Math.round(Math.hypot(x, y) * CONSTANTS.rounding) / CONSTANTS.rounding,
						a: Math.round((((-Math.atan2(x, y) / CONSTANTS.radiansConversion) + CONSTANTS.circleDegrees + CONSTANTS.circleDegrees / 4) % CONSTANTS.circleDegrees) * CONSTANTS.rounding) / CONSTANTS.rounding
					}
			}
			catch (error) {
				CORE.logError(error)
				return null
			}
		}

	/* getCartesianCoordinates */
		module.exports.getCartesianCoordinates = getCartesianCoordinates
		function getCartesianCoordinates(r, a) {
			try {
				// calculate
					return {
						x: Math.round(Math.cos(a * CONSTANTS.radiansConversion) * r * CONSTANTS.rounding) / CONSTANTS.rounding,
						y: Math.round(Math.sin(a * CONSTANTS.radiansConversion) * r * CONSTANTS.rounding) / CONSTANTS.rounding
					}
			}
			catch (error) {
				CORE.logError(error)
				return null
			}
		}

	/* getReflection */
		module.exports.getReflection = getReflection
		function getReflection(puckA, wallA) {
			try {
				// calculate
					return Math.round((((2 * wallA - puckA) + CONSTANTS.circleDegrees) % CONSTANTS.circleDegrees) * CONSTANTS.rounding) / CONSTANTS.rounding
			}
			catch (error) {
				CORE.logError(error)
				return puckA
			}
		}

	/* getOverlap */
		module.exports.getOverlap = getOverlap
		function getOverlap(object1, object2) {
			try {
				// get distances
						var distanceX = object2.x - object1.x
						var distanceY = object2.y - object1.y
						var distance = Math.hypot(distanceX, distanceY)
					var overlap = (object1.r + object2.r) - distance

				// get angle
					var angle = (Math.atan2(distanceY, distanceX) / CONSTANTS.radiansConversion + CONSTANTS.circleDegrees) % CONSTANTS.circleDegrees

				// return
					return {
						collision: Boolean(overlap > 0),
						d: overlap,
						x: Math.abs(distanceX),
						y: Math.abs(distanceY),
						a: angle
					}
			}
			catch (error) {
				CORE.logError(error)
				return null
			}
		}

/*** game loop ***/
	/* calculateGame */
		module.exports.calculateGame = calculateGame
		function calculateGame(gameId, callback) {
			try {
				// no gameId
					if (!gameId) {
						return
					}

				// query
					var query = CORE.getSchema("query")
						query.collection = "games"
						query.command = "find"
						query.filters = {id: gameId}

				// update
					CORE.accessDatabase(query, function(results) {
						if (!results.success) {
							return
						}

						// no game
							var game = results.documents[0]
							if (!game) {
								return
							}

						// not started
							if (!game.status.startTime) {
								// all players
									for (var i in game.players) {
										callback({gameId: game.id, success: true, message: null, playerId: i, game: {updated: game.updated, status: game.status, players: game.players}, recipients: [game.players[i].sessionId]})
									}

								// spectators
									callback({gameId: game.id, success: true, game: {updated: game.updated, status: game.status, players: game.players}, recipients: Object.keys(game.spectators)})
							}

						// ended
							else if (game.status.endTime) {
								// all players
									for (var i in game.players) {
										callback({gameId: game.id, success: true, message: null, playerId: i, game: {updated: game.updated, status: game.status, players: game.players}, recipients: [game.players[i].sessionId]})
									}

								// spectators
									callback({gameId: game.id, success: true, game: {updated: game.updated, status: game.status, players: game.players}, recipients: Object.keys(game.spectators)})
							}

						// in play
							else {
								// time
									game.status.timeRemaining -= CONSTANTS.loopTime

								// message
									calculateMessage(game)

								// started
									if (game.status.startTime < new Date().getTime()) {
										// enough pucks?
											var puckCount = Object.keys(game.pucks).length
											if (puckCount < game.settings.puckCountMaximum) {
												var puck = CORE.getSchema("puck")
													puck.velocity = getCartesianCoordinates(
														(Math.random() * (game.settings.puckVelocityMaximumInitial - game.settings.puckVelocityMinimumInitial)) + game.settings.puckVelocityMinimumInitial,
														 Math.random() * CONSTANTS.circleDegrees
													)
												game.pucks[puck.id] = puck
											}

										// move pucks
											for (var i in game.pucks) {
												calculatePosition(game, game.pucks[i])
											}

										// game end
											if (game.status.timeRemaining <= 0) {
												game.status.endTime = new Date().getTime()
												calculateWinner(game)
											}
									}

								// query
									game.updated = new Date().getTime()
									var query = CORE.getSchema("query")
										query.collection = "games"
										query.command = "update"
										query.filters = {id: gameId}
										query.document = game

								// update
									CORE.accessDatabase(query, function(results) {
										if (!results.success) {
											CORE.logError(results)
											return
										}

										// game
											var game = results.documents[0]
								
										// all players
											for (var i in game.players) {
												callback({gameId: game.id, success: true, message: null, playerId: i, game: {updated: game.updated, status: game.status, players: game.players, pucks: game.pucks}, recipients: [game.players[i].sessionId]})
											}

										// spectators
											callback({gameId: game.id, success: true, game: {updated: game.updated, status: game.status, players: game.players, pucks: game.pucks}, recipients: Object.keys(game.spectators)})

										// end -> delete
											if (game.status.endTime) {
												deleteOne(game.id)
											}
									})
							}
					})
			}
			catch (error) {
				CORE.logError(error)
				callback({gameId: gameId, success: false, message: "unable to " + arguments.callee.name, recipients: [REQUEST.session.id]})
			}
		}

	/* calculateMessage */
		module.exports.calculateMessage = calculateMessage
		function calculateMessage(game) {
			try {
				// messageTimeRemaining
					game.status.messageTimeRemaining -= CONSTANTS.loopTime

				// clear?
					if (game.status.messageTimeRemaining <= 0) {
						game.status.messageTimeRemaining = 0
						game.status.message = null
					}

				// now
					var now = new Date().getTime()

				// pre game
					if (now < game.status.startTime) {
						if (game.status.startTime - now > CONSTANTS.second * 4) {
							game.status.message = "GET READY"
							game.status.messageTimeRemaining = game.settings.messageDuration
							return
						}
						if (game.status.startTime - now > CONSTANTS.second * 3) {
							game.status.message = "3"
							game.status.messageTimeRemaining = game.settings.messageDuration
							return
						}
						if (game.status.startTime - now > CONSTANTS.second * 2) {
							game.status.message = "2"
							game.status.messageTimeRemaining = game.settings.messageDuration
							return
						}
						if (game.status.startTime - now > CONSTANTS.second * 1) {
							game.status.message = "1"
							game.status.messageTimeRemaining = game.settings.messageDuration
							return
						}
						if (game.status.startTime - now > 0) {
							game.status.message = "GO"
							game.status.messageTimeRemaining = game.settings.messageDuration
							return
						}
					}

				// 10-second countdown
					if (game.status.timeRemaining <= CONSTANTS.second * 11) {
						game.status.message = String(Math.floor(game.status.timeRemaining / CONSTANTS.second))
						game.status.messageTimeRemaining = game.settings.messageDuration
						return
					}

				// game end
					if (game.status.timeRemaining <= 0) {
						game.status.message = "GAME OVER"
						game.status.messageTimeRemaining = game.settings.messageDuration
						return
					}
			}
			catch (error) {
				CORE.logError(error)
			}
		}

	/* calculatePosition */
		module.exports.calculatePosition = calculatePosition
		function calculatePosition(game, puck) {
			try {
				// update - based on velocity
					var newX = Math.round((puck.position.x + puck.velocity.x) * CONSTANTS.rounding) / CONSTANTS.rounding
					var newY = Math.round((puck.position.y + puck.velocity.y) * CONSTANTS.rounding) / CONSTANTS.rounding
					var newRadialCoordinates = getRadialCoordinates(newX, newY)

				// edge
					if (newRadialCoordinates.r > game.settings.arenaRadius) {
						// claimed?
							if (puck.colors && puck.colors.length) {
								// goal --> eliminate & score
									for (var i in game.players) {
										// get player
											var thatPlayer = game.players[i]

										// get goal
											var startAngle = ((thatPlayer.goal.centerAngle - thatPlayer.goal.angularWidth / 2) + CONSTANTS.circleDegrees) % CONSTANTS.circleDegrees
											var endAngle =   ((thatPlayer.goal.centerAngle + thatPlayer.goal.angularWidth / 2) + CONSTANTS.circleDegrees) % CONSTANTS.circleDegrees

											if (((newRadialCoordinates.a - startAngle + CONSTANTS.circleDegrees) % CONSTANTS.circleDegrees < (endAngle - startAngle + CONSTANTS.circleDegrees) % CONSTANTS.circleDegrees)
											 && ((  endAngle - newRadialCoordinates.a + CONSTANTS.circleDegrees) % CONSTANTS.circleDegrees < (endAngle - startAngle + CONSTANTS.circleDegrees) % CONSTANTS.circleDegrees)) {
												calculateGoal(game, thatPlayer, puck)
												return
											}
									}
							}

						// neutral --> reflection
							var currentVelocity = getRadialCoordinates(puck.velocity.x, puck.velocity.y)
							var reflectionAngle = getReflection(currentVelocity.a, (newRadialCoordinates.a + CONSTANTS.circleDegrees / 4) % CONSTANTS.circleDegrees)

						// update velocity
							puck.velocity = getCartesianCoordinates(currentVelocity.r, reflectionAngle)

						// record collision
							puck.lastCollision = null
					}

				// update position
					puck.position.x = newX
					puck.position.y = newY

				// puck-puck collisions
					for (var i in game.pucks) {
						// same puck
							if (i == puck.id) {
								continue
							}

						// thatPuck
							var thatPuck = game.pucks[i]

						// overlap
							var overlap = getOverlap({
								x: thatPuck.position.x,
								y: thatPuck.position.y,
								r: game.settings.puckRadius,
							}, {
								x: puck.position.x,
								y: puck.position.y,
								r: game.settings.puckRadius
							})

						// collision
							if (overlap.collision) {
								// get acceleration
									var centerToCenterDistance = game.settings.puckRadius * 2
									var ax = (Math.cos(overlap.a * CONSTANTS.radiansConversion) * centerToCenterDistance) - (puck.position.x - thatPuck.position.x)
									var ay = (Math.sin(overlap.a * CONSTANTS.radiansConversion) * centerToCenterDistance) - (puck.position.y - thatPuck.position.y)
								
								// update velocity
									var thatPuckRadialVelocity = getRadialCoordinates(thatPuck.velocity.x - ax, thatPuck.velocity.y - ay)
										thatPuckRadialVelocity.r = Math.min(thatPuckRadialVelocity.r, game.settings.puckVelocityMaximum)
									thatPuck.velocity = getCartesianCoordinates(thatPuckRadialVelocity.r, thatPuckRadialVelocity.a)

									var puckRadialVelocity = getRadialCoordinates(puck.velocity.x + ax, puck.velocity.y + ay)
										puckRadialVelocity.r = Math.min(puckRadialVelocity.r, game.settings.puckVelocityMaximum)
									puck.velocity = getCartesianCoordinates(puckRadialVelocity.r, puckRadialVelocity.a)

								// record collision
									thatPuck.lastCollision = null
									puck.lastCollision = null
							}
					}

				// puck-player collisions
					for (var i in game.players) {
						// thatPlayer
							var thatPlayer = game.players[i]

						// overlap
							var overlap = getOverlap({
								x: thatPlayer.position.x,
								y: thatPlayer.position.y,
								r: game.settings.playerRadius,
							}, {
								x: puck.position.x,
								y: puck.position.y,
								r: game.settings.puckRadius
							})

						// collision
							if (overlap.collision) {
								// get acceleration
									var centerToCenterDistance = game.settings.puckRadius + game.settings.playerRadius
									var ax = (Math.cos(overlap.a * CONSTANTS.radiansConversion) * centerToCenterDistance) - (puck.position.x - thatPlayer.position.x)
									var ay = (Math.sin(overlap.a * CONSTANTS.radiansConversion) * centerToCenterDistance) - (puck.position.y - thatPlayer.position.y)

								// update velocity
									var puckRadialVelocity = getRadialCoordinates(puck.velocity.x + ax, puck.velocity.y + ay)
										puckRadialVelocity.r = Math.min(puckRadialVelocity.r, game.settings.puckVelocityMaximum)
									puck.velocity = getCartesianCoordinates(puckRadialVelocity.r, puckRadialVelocity.a)

								// different from last collision?
									if (puck.lastCollision !== i) {
										// record collision
											puck.lastCollision = i

										// colors
											var evenWedge = Math.floor(game.settings.puckWedges / game.settings.puckMemory)
											puck.colors.splice(game.settings.puckWedges - evenWedge, evenWedge) // AAAAAA --> AAAA | BBBAAA --> BBBA | CCCBBA --> CCCB
											puck.colors.splice(evenWedge, evenWedge - 1) // AAAA   --> AAA  | BBBA   --> BBA  | CCCB --> CCB
											while (puck.colors.length < game.settings.puckWedges) {  // AAA --> BBBAAA | BBA --> CCCBBA | CCB --> DDDCCB
												puck.colors.unshift(thatPlayer.color)
											}
									}
							}
					}
			}
			catch (error) {
				CORE.logError(error)
			}
		}

	/* calculateGoal */
		module.exports.calculateGoal = calculateGoal
		function calculateGoal(game, goalee, puck) {
			try {
				// player keys
					var playerKeys = Object.keys(game.players)
					var maximumGoalAngle = CONSTANTS.circleDegrees - (game.settings.arenaWedgeAngleGoalMinimum + game.settings.arenaWedgeAngleNeutral) * (playerKeys.length - 1) - game.settings.arenaWedgeAngleNeutral

				// loop through colors
					for (var i in puck.colors) {
						// find scorer
							var scorerId = playerKeys.find(function(key) {
								return game.players[key].color == puck.colors[i]
							})

						// self --> skip
							if (scorerId == goalee.id) {
								continue
							}

						// other --> enlarge that goal
							var scorer = game.players[scorerId]
								scorer.goal.angularWidth = Math.min(maximumGoalAngle, Math.max(game.settings.arenaWedgeAngleGoalMinimum, scorer.goal.angularWidth + game.settings.arenaWedgeAngleGoalChange))

						// shrink this goal
							goalee.goal.angularWidth = Math.min(maximumGoalAngle, Math.max(game.settings.arenaWedgeAngleGoalMinimum, goalee.goal.angularWidth - game.settings.arenaWedgeAngleGoalChange))
					}

				// delete puck
					delete game.pucks[puck.id]

				// reset central angles
					var runningTotalAngle = -game.players[playerKeys[0]].goal.angularWidth / 2
					for (var i in playerKeys) {
						// player
							var thatPlayer = game.players[playerKeys[i]]
								thatPlayer.goal.centerAngle = runningTotalAngle + thatPlayer.goal.angularWidth / 2

						// update 
							runningTotalAngle += thatPlayer.goal.angularWidth
							runningTotalAngle += game.settings.arenaWedgeAngleNeutral
					}

				// score message
					game.status.message = "GOAL ON " + goalee.color.toUpperCase()
					game.status.messageTimeRemaining = game.settings.messageDuration
			}
			catch (error) {
				CORE.logError(error)
			}
		}

	/* calculateWinner */
		module.exports.calculateWinner = calculateWinner
		function calculateWinner(game) {
			try {
				// get goal angles
					var winners = []
					var winningAngle = 0
					for (var i in game.players) {
						if (game.players[i].goal.angularWidth == winningAngle) {
							winners.push(game.players[i].color.toUpperCase())
						}
						else if (game.players[i].goal.angularWidth > winningAngle) {
							winningAngle = game.players[i].goal.angularWidth
							winners = [game.players[i].color.toUpperCase()]
						}
					}

				// message
					game.status.message = "WINNER" + (winners.length > 1 ? "S" : "") + ": " + winners.join(" & ")
					game.status.messageTimeRemaining = game.settings.messageDuration
			}
			catch (error) {
				CORE.logError(error)
			}
		}
