import os
import sys

# conftest.py installs all external service mocks before this module loads
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from entity_router import generate_slug
from state_manager import StateManager


def test_generate_slug_basic():
    assert generate_slug("Hello World") == "hello-world"


def test_generate_slug_with_special_chars():
    assert generate_slug("Test@Entity!") == "test-entity"


def test_generate_slug_empty_string():
    assert generate_slug("") == ""


def test_compute_changed_keys_identical_states():
    prev = {"a": 1, "b": 2}
    curr = {"a": 1, "b": 2}
    assert StateManager.compute_changed_keys(prev, curr) == []


def test_compute_changed_keys_one_key_changed():
    prev = {"a": 1, "b": 2}
    curr = {"a": 1, "b": 3}
    assert StateManager.compute_changed_keys(prev, curr) == ["b"]


def test_compute_changed_keys_key_added():
    prev = {"a": 1}
    curr = {"a": 1, "b": 2}
    assert StateManager.compute_changed_keys(prev, curr) == ["b"]


def test_compute_changed_keys_key_removed():
    prev = {"a": 1, "b": 2}
    curr = {"a": 1}
    assert StateManager.compute_changed_keys(prev, curr) == ["b"]


def test_deep_merge_no_overlap():
    base = {"a": 1, "c": 3}
    update = {"b": 2, "d": 4}
    result = StateManager._deep_merge(base, update)
    assert result == {"a": 1, "c": 3, "b": 2, "d": 4}


def test_deep_merge_nested_dicts():
    base = {"a": {"x": 1, "y": 2}, "b": 3}
    update = {"a": {"y": 20, "z": 30}, "c": 4}
    result = StateManager._deep_merge(base, update)
    assert result == {"a": {"x": 1, "y": 20, "z": 30}, "b": 3, "c": 4}


def test_check_type_string():
    assert StateManager._check_type("hello", "string") is True


def test_check_type_number():
    assert StateManager._check_type(42, "number") is True
    assert StateManager._check_type(3.14, "number") is True
    assert StateManager._check_type(True, "number") is False  # bool is not number


def test_check_type_boolean():
    assert StateManager._check_type(True, "boolean") is True
    assert StateManager._check_type(False, "boolean") is True
    assert StateManager._check_type("true", "boolean") is False


def test_check_type_vector2():
    assert StateManager._check_type({"x": 1, "y": 2}, "vector2") is True
    assert StateManager._check_type({"x": 1}, "vector2") is False
    # Current implementation checks x+y presence only (not strict key count),
    # so a vector3 dict also satisfies vector2 — this is a known limitation.
    assert StateManager._check_type({"x": 1, "y": 2, "z": 3}, "vector2") is True


def test_check_type_vector3():
    assert StateManager._check_type({"x": 1, "y": 2, "z": 3}, "vector3") is True
    assert StateManager._check_type({"x": 1, "y": 2}, "vector3") is False


def test_check_type_incorrect_types():
    assert StateManager._check_type(42, "string") is False
    assert StateManager._check_type("hello", "number") is False
    assert StateManager._check_type("hello", "boolean") is False
    assert StateManager._check_type([1, 2], "array") is True
    assert StateManager._check_type({"a": 1}, "object") is True
    assert StateManager._check_type("color", "color") is True
    assert StateManager._check_type(10, "range") is True
    assert StateManager._check_type("enum_val", "enum") is True


def test_validate_state_against_variables_clean_state():
    state = {"input1": "value", "output1": 42}
    variables = {
        "inputs": [{"name": "input1", "type": "string", "required": True}],
        "outputs": [{"name": "output1", "type": "number", "required": False}]
    }
    warnings = StateManager().validate_state_against_variables(state, variables)
    assert len(warnings) == 0


def test_validate_state_against_variables_type_mismatch():
    state = {"input1": 123}
    variables = {
        "inputs": [{"name": "input1", "type": "string", "required": True}]
    }
    warnings = StateManager().validate_state_against_variables(state, variables)
    assert len(warnings) == 1
    warning = warnings[0]
    assert warning["variable_name"] == "input1"
    assert warning["expected_type"] == "string"
    assert warning["actual_type"] == "int"
    assert warning["message"] == "State key 'input1' has type 'int' but expected 'string'"
    assert warning["severity"] == "warning"


def test_validate_state_against_variables_missing_required_input():
    state = {}
    variables = {
        "inputs": [{"name": "required_input", "type": "string", "required": True}]
    }
    warnings = StateManager().validate_state_against_variables(state, variables)
    assert len(warnings) == 1
    warning = warnings[0]
    assert warning["variable_name"] == "required_input"
    assert warning["expected_type"] == "string"
    assert warning["actual_type"] == "missing"
    assert warning["message"] == "Required input 'required_input' is missing from state"
    assert warning["severity"] == "warning"