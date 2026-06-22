// parse-state.js — Parse Maestra entity-state OSC payloads in Max.
//
// Feed it the payload coming out of [oscparse] after you have routed to
// /maestra/entity/state. Outlets:
//   0: entity slug (symbol)
//   1: current state as a Max dictionary
//   2: changed keys (list)
autowatch = 1;
outlets = 3;

function anything() {
	var args = arrayfromargs(messagename, arguments);
	// Re-join everything after the OSC address into the JSON payload string.
	var payload = args.slice(1).join(' ');
	try {
		var data = JSON.parse(payload);
		if (data.type === 'state_changed') {
			if (data.entity_slug) outlet(0, data.entity_slug);
			if (data.current_state) outlet(1, 'dictionary', JSON.stringify(data.current_state));
			if (data.changed_keys) outlet(2, data.changed_keys);
		}
	} catch (e) {
		post('Maestra parse-state error: ' + e + '\n');
	}
}
