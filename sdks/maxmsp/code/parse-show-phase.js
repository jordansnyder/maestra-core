// parse-show-phase.js — Extract the show-control phase from Maestra state events.
//
// Route OSC to the show_control/show entity, then feed the payload here. Outlets:
//   0: current phase (symbol: idle | pre_show | active | paused | post_show | shutdown)
//   1: previous phase (symbol)
autowatch = 1;
outlets = 2;

function anything() {
	var args = arrayfromargs(messagename, arguments);
	var payload = args.slice(1).join(' ');
	try {
		var data = JSON.parse(payload);
		var state = data.current_state || data.state || data;
		if (state && state.phase) {
			outlet(0, state.phase);
			outlet(1, state.previous_phase || 'idle');
		}
	} catch (e) {
		post('Maestra parse-show-phase error: ' + e + '\n');
	}
}
