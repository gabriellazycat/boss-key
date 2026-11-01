extends Node
## Camada de rede. O jogo inteiro usa a API de multiplayer do Godot; aqui só se troca o "peer":
## offline (solo), ENet (IP/rede local) ou Steam (GodotSteam, quando instalado).

signal lobby_changed
signal connection_failed(reason: String)
signal joined
signal host_left

enum Mode { OFFLINE, ENET, STEAM }

const PORT := 24680
var mode := Mode.OFFLINE
## id → {name, look, desk, ready}
var players := {}
var steam_lobby_id := 0

func _ready() -> void:
	multiplayer.peer_connected.connect(_on_peer_connected)
	multiplayer.peer_disconnected.connect(_on_peer_disconnected)
	multiplayer.connected_to_server.connect(_on_connected)
	multiplayer.connection_failed.connect(func(): connection_failed.emit("Não deu para conectar."))
	multiplayer.server_disconnected.connect(_on_server_gone)

func is_host() -> bool:
	return multiplayer.multiplayer_peer == null or multiplayer.is_server()

func my_id() -> int:
	return multiplayer.get_unique_id() if multiplayer.multiplayer_peer else 1

func online() -> bool:
	return mode != Mode.OFFLINE

func start_solo() -> void:
	close()
	mode = Mode.OFFLINE
	multiplayer.multiplayer_peer = OfflineMultiplayerPeer.new()
	players = {1: _me(0)}
	lobby_changed.emit()

func host_enet(port := PORT) -> Error:
	close()
	var peer := ENetMultiplayerPeer.new()
	var err := peer.create_server(port, B.MAX_PLAYERS - 1)
	if err != OK:
		return err
	multiplayer.multiplayer_peer = peer
	mode = Mode.ENET
	players = {1: _me(0)}
	lobby_changed.emit()
	return OK

func join_enet(address: String, port := PORT) -> Error:
	close()
	var peer := ENetMultiplayerPeer.new()
	var err := peer.create_client(address, port)
	if err != OK:
		return err
	multiplayer.multiplayer_peer = peer
	mode = Mode.ENET
	return OK

## ---- Steam (GodotSteam). Só existe se o addon estiver instalado e o Steam aberto.
func steam_available() -> bool:
	return Engine.has_singleton("Steam") and ClassDB.class_exists("SteamMultiplayerPeer")

func host_steam() -> Error:
	if not steam_available():
		return ERR_UNAVAILABLE
	close()
	var steam = Engine.get_singleton("Steam")
	if not steam.lobby_created.is_connected(_on_steam_lobby_created):
		steam.lobby_created.connect(_on_steam_lobby_created)
	steam.createLobby(2, B.MAX_PLAYERS)   # 2 = público para amigos
	mode = Mode.STEAM
	return OK

func join_steam(lobby_id: int) -> Error:
	if not steam_available():
		return ERR_UNAVAILABLE
	close()
	var steam = Engine.get_singleton("Steam")
	if not steam.lobby_joined.is_connected(_on_steam_lobby_joined):
		steam.lobby_joined.connect(_on_steam_lobby_joined)
	steam.joinLobby(lobby_id)
	mode = Mode.STEAM
	return OK

func _on_steam_lobby_created(result: int, lobby_id: int) -> void:
	if result != 1:
		connection_failed.emit("A Steam não criou a sala (%d)." % result)
		return
	steam_lobby_id = lobby_id
	var steam = Engine.get_singleton("Steam")
	steam.setLobbyData(lobby_id, "game", "bosskey")
	var peer = ClassDB.instantiate("SteamMultiplayerPeer")
	peer.create_host(0)
	multiplayer.multiplayer_peer = peer
	players = {1: _me(0)}
	lobby_changed.emit()

func _on_steam_lobby_joined(lobby_id: int, _perm: int, _locked: bool, response: int) -> void:
	if response != 1:
		connection_failed.emit("Não deu para entrar na sala Steam.")
		return
	steam_lobby_id = lobby_id
	var steam = Engine.get_singleton("Steam")
	var owner_id: int = steam.getLobbyOwner(lobby_id)
	if owner_id == steam.getSteamID():
		return
	var peer = ClassDB.instantiate("SteamMultiplayerPeer")
	peer.create_client(owner_id, 0)
	multiplayer.multiplayer_peer = peer

func invite_friends() -> void:
	if steam_lobby_id and steam_available():
		Engine.get_singleton("Steam").activateGameOverlayInviteDialog(steam_lobby_id)

func close() -> void:
	if multiplayer.multiplayer_peer and not (multiplayer.multiplayer_peer is OfflineMultiplayerPeer):
		multiplayer.multiplayer_peer.close()
	if steam_lobby_id and steam_available():
		Engine.get_singleton("Steam").leaveLobby(steam_lobby_id)
	steam_lobby_id = 0
	multiplayer.multiplayer_peer = OfflineMultiplayerPeer.new()
	mode = Mode.OFFLINE
	players = {}

func _me(desk: int) -> Dictionary:
	return {"name": Settings.player_name, "look": Settings.look, "desk": desk, "ready": false}

## ---- lobby: o host é a autoridade da lista
func _on_connected() -> void:
	_hello.rpc_id(1, Settings.player_name, Settings.look)
	joined.emit()

@rpc("any_peer", "reliable")
func _hello(pname: String, look: int) -> void:
	if not multiplayer.is_server():
		return
	var id := multiplayer.get_remote_sender_id()
	if players.size() >= B.MAX_PLAYERS or Game.in_run:
		multiplayer.multiplayer_peer.disconnect_peer(id)
		return
	var used := []
	for p in players.values():
		used.append(p.desk)
	var desk := 0
	while desk in used:
		desk += 1
	players[id] = {"name": pname.substr(0, 16), "look": look, "desk": desk, "ready": false}
	_push_lobby()

func _push_lobby() -> void:
	_lobby.rpc(players)
	lobby_changed.emit()

@rpc("authority", "reliable")
func _lobby(list: Dictionary) -> void:
	players = list
	lobby_changed.emit()

func _on_peer_connected(_id: int) -> void:
	pass

func _on_peer_disconnected(id: int) -> void:
	if multiplayer.is_server() and players.has(id):
		players.erase(id)
		_push_lobby()
		Game.on_player_left(id)

func _on_server_gone() -> void:
	close()
	host_left.emit()
