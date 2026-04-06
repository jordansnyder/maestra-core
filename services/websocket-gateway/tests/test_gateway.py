"""
Tests for WebSocket gateway NATS-style subject pattern matching.

The _subject_matches function implements NATS wildcard semantics:
  *  matches exactly one token
  >  matches one or more tokens (must be last token)
"""

import sys
import os

# Add service root to path so we can import gateway directly
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from gateway import _subject_matches


# ---------------------------------------------------------------------------
# * wildcard (matches exactly one token)
# ---------------------------------------------------------------------------

def test_star_wildcard_matches_two_trailing_tokens():
    """maestra.entity.state.*.* should match subjects with exactly
    two tokens after 'state' (e.g., <type>.<slug>).
    """
    assert _subject_matches(
        "maestra.entity.state.*.*",
        "maestra.entity.state.light.my-entity",
    ) is True


def test_star_wildcard_rejects_three_trailing_tokens():
    """maestra.entity.state.*.* should NOT match subjects with three
    tokens after 'state' — the pattern expects exactly 5 total tokens.
    """
    assert _subject_matches(
        "maestra.entity.state.*.*",
        "maestra.entity.state.update.my-entity.extra",
    ) is False


def test_star_wildcard_rejects_one_trailing_token():
    """maestra.entity.state.*.* should NOT match subjects with only
    one token after 'state'.
    """
    assert _subject_matches(
        "maestra.entity.state.*.*",
        "maestra.entity.state.light",
    ) is False


# ---------------------------------------------------------------------------
# > wildcard (matches one or more tokens, must be last)
# ---------------------------------------------------------------------------

def test_gt_wildcard_matches_two_trailing():
    """maestra.entity.state.> should match subjects with two tokens
    after 'state' (one-or-more rule).
    """
    assert _subject_matches(
        "maestra.entity.state.>",
        "maestra.entity.state.light.my-entity",
    ) is True


def test_gt_wildcard_matches_one_trailing():
    """maestra.entity.state.> should match subjects with one token
    after 'state' (minimum for >).
    """
    assert _subject_matches(
        "maestra.entity.state.>",
        "maestra.entity.state.light",
    ) is True


def test_gt_wildcard_matches_many_trailing():
    """maestra.> should match any subject starting with 'maestra.'
    followed by one or more tokens.
    """
    assert _subject_matches(
        "maestra.>",
        "maestra.anything.here",
    ) is True


def test_gt_wildcard_rejects_zero_trailing():
    """maestra.entity.state.> should NOT match a subject that ends
    at 'state' with no additional tokens (> requires one-or-more).
    """
    assert _subject_matches(
        "maestra.entity.state.>",
        "maestra.entity.state",
    ) is False


# ---------------------------------------------------------------------------
# Exact match (no wildcards)
# ---------------------------------------------------------------------------

def test_exact_match():
    """A pattern with no wildcards should match only the identical subject."""
    assert _subject_matches(
        "maestra.entity.state.light.my-entity",
        "maestra.entity.state.light.my-entity",
    ) is True


def test_exact_mismatch():
    """A pattern with no wildcards should NOT match a different subject."""
    assert _subject_matches(
        "maestra.entity.state.light.my-entity",
        "maestra.entity.state.light.other-entity",
    ) is False


def test_exact_mismatch_length():
    """A pattern with no wildcards should NOT match a subject with
    a different number of tokens.
    """
    assert _subject_matches(
        "maestra.entity.state",
        "maestra.entity.state.light",
    ) is False
