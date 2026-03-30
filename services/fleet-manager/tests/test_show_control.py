"""
Tests for the Show Control state machine and transition logic.
Tests the state machine validation independently of the database.
"""

import pytest
from show_control_router import VALID_TRANSITIONS, SHOW_PHASES


class TestShowStateMachine:
    """Test the state machine transition rules."""

    def test_all_phases_have_transitions(self):
        """Every phase should have at least one valid transition."""
        for phase in SHOW_PHASES:
            assert phase in VALID_TRANSITIONS, f"Phase {phase} missing from VALID_TRANSITIONS"
            assert len(VALID_TRANSITIONS[phase]) > 0, f"Phase {phase} has no valid transitions"

    def test_idle_transitions(self):
        assert VALID_TRANSITIONS['idle'] == ['pre_show']

    def test_pre_show_transitions(self):
        assert set(VALID_TRANSITIONS['pre_show']) == {'active', 'shutdown'}

    def test_active_transitions(self):
        assert set(VALID_TRANSITIONS['active']) == {'paused', 'post_show', 'shutdown'}

    def test_paused_transitions(self):
        assert set(VALID_TRANSITIONS['paused']) == {'active', 'post_show', 'shutdown'}

    def test_post_show_transitions(self):
        assert set(VALID_TRANSITIONS['post_show']) == {'idle', 'shutdown'}

    def test_shutdown_transitions(self):
        assert VALID_TRANSITIONS['shutdown'] == ['idle']

    def test_invalid_idle_to_active(self):
        """Cannot skip from idle directly to active."""
        assert 'active' not in VALID_TRANSITIONS['idle']

    def test_invalid_idle_to_paused(self):
        """Cannot pause from idle (nothing to pause)."""
        assert 'paused' not in VALID_TRANSITIONS['idle']

    def test_invalid_post_show_to_active(self):
        """Cannot go from post_show directly to active (must reset first)."""
        assert 'active' not in VALID_TRANSITIONS['post_show']

    def test_shutdown_from_any_phase(self):
        """Every phase except shutdown itself should allow transition to shutdown."""
        for phase in SHOW_PHASES:
            if phase == 'shutdown':
                continue
            assert 'shutdown' in VALID_TRANSITIONS[phase], \
                f"Phase {phase} should allow transition to shutdown"

    def test_happy_path_sequence(self):
        """Verify the happy path: idle -> pre_show -> active -> post_show -> idle."""
        path = ['idle', 'pre_show', 'active', 'post_show', 'idle']
        for i in range(len(path) - 1):
            current = path[i]
            next_phase = path[i + 1]
            assert next_phase in VALID_TRANSITIONS[current], \
                f"Happy path broken: {current} -> {next_phase}"

    def test_pause_resume_cycle(self):
        """Verify pause and resume work: active -> paused -> active."""
        assert 'paused' in VALID_TRANSITIONS['active']
        assert 'active' in VALID_TRANSITIONS['paused']

    def test_stop_from_paused(self):
        """Can end show from paused state."""
        assert 'post_show' in VALID_TRANSITIONS['paused']


class TestShowSchedulerCron:
    """Test cron matching logic."""

    def test_import_scheduler(self):
        from show_scheduler import ShowScheduler
        scheduler = ShowScheduler()
        assert scheduler is not None

    def test_wildcard_matches(self):
        from show_scheduler import ShowScheduler
        from datetime import datetime
        s = ShowScheduler()
        # * * * * * should match any time
        now = datetime(2026, 3, 29, 10, 30, 0)
        assert s._cron_matches("* * * * *", now) is True

    def test_exact_minute_hour(self):
        from show_scheduler import ShowScheduler
        from datetime import datetime
        s = ShowScheduler()
        now = datetime(2026, 3, 29, 10, 30, 0)
        assert s._cron_matches("30 10 * * *", now) is True
        assert s._cron_matches("31 10 * * *", now) is False
        assert s._cron_matches("30 11 * * *", now) is False

    def test_step_field(self):
        from show_scheduler import ShowScheduler
        from datetime import datetime
        s = ShowScheduler()
        now = datetime(2026, 3, 29, 10, 30, 0)
        assert s._cron_matches("*/5 * * * *", now) is True  # 30 % 5 == 0
        assert s._cron_matches("*/7 * * * *", now) is False  # 30 % 7 != 0

    def test_range_field(self):
        from show_scheduler import ShowScheduler
        from datetime import datetime
        s = ShowScheduler()
        now = datetime(2026, 3, 29, 10, 30, 0)  # Saturday
        # Saturday = weekday 5 in Python, = 6 in cron
        assert s._cron_matches("30 10 * * 1-5", now) is False  # Mon-Fri only
        assert s._cron_matches("30 10 * * 0-6", now) is True  # All week

    def test_cron_time_extraction(self):
        from show_scheduler import ShowScheduler
        s = ShowScheduler()
        h, m = s._cron_time("30 10 * * *")
        assert h == 10
        assert m == 30
        h, m = s._cron_time("* * * * *")
        assert h is None
        assert m is None
