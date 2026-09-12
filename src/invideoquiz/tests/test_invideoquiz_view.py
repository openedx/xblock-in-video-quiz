"""Tests for InVideoQuizXBlock views and field parsing."""

import json
from unittest.mock import Mock, MagicMock

from invideoquiz.invideoquiz import (
    InVideoQuizXBlock,
    format_timestamp_display,
    normalize_timemap_problem_ids,
    parse_jump_back_field,
    parse_timemap_field,
    time_sort_key,
)
from xblock.runtime import DictKeyValueStore, KvsFieldData
from xblock.test.tools import TestRuntime as Runtime


def _make_block(**field_values):
    key_store = DictKeyValueStore()
    field_data = KvsFieldData(key_store)
    runtime = Runtime(services={'field-data': field_data})
    runtime.local_resource_url = Mock(return_value='/static/test-resource')
    block = InVideoQuizXBlock(runtime, scope_ids=Mock())
    for key, value in field_values.items():
        setattr(block, key, value)
    return block


def test_invideoquiz_model_defaults():
    """Default field values match expected legacy defaults."""
    block = _make_block()
    assert block.display_name == 'In-Video Quiz XBlock'
    assert block.timemap == '{}'
    assert block.video_id == ''
    assert block.jump_back == ''


class TestParseTimemapField:
    def test_empty_returns_empty_dict(self):
        assert parse_timemap_field('') == {}
        assert parse_timemap_field(None) == {}

    def test_legacy_single_problem(self):
        raw = '{"1:30": "problem-1", "2:00": "problem-2"}'
        assert parse_timemap_field(raw) == {
            '1:30': 'problem-1',
            '2:00': 'problem-2',
        }

    def test_multi_problem_array_at_same_timestamp(self):
        raw = '{"1:30": ["problem-1", "problem-2"]}'
        assert parse_timemap_field(raw) == {
            '1:30': ['problem-1', 'problem-2'],
        }

    def test_invalid_json_returns_empty_dict(self):
        assert parse_timemap_field('not-json') == {}


class TestParseJumpBackField:
    def test_empty_returns_empty_dict(self):
        assert parse_jump_back_field('') == {}
        assert parse_jump_back_field(None) == {}

    def test_legacy_global_mm_ss_string(self):
        assert parse_jump_back_field('1:29') == '1:29'

    def test_legacy_time_keyed_map(self):
        raw = '{"1:30": "1:29", "2:00": "1:45"}'
        assert parse_jump_back_field(raw) == {
            '1:30': '1:29',
            '2:00': '1:45',
        }

    def test_per_problem_map(self):
        raw = '{"problem-1": "1:29", "problem-2": "1:45"}'
        assert parse_jump_back_field(raw) == {
            'problem-1': '1:29',
            'problem-2': '1:45',
        }

    def test_json_encoded_string_value(self):
        assert parse_jump_back_field('"1:29"') == '1:29'


class TestAuthorViewHelpers:
    def test_time_sort_key_orders_timestamps(self):
        assert time_sort_key('2:00') > time_sort_key('1:30')
        assert time_sort_key('00:10') < time_sort_key('00:11')

    def test_format_timestamp_display_strips_leading_zeros(self):
        assert format_timestamp_display('00:10') == '0:10'
        assert format_timestamp_display('1:5') == '1:05'

    def test_normalize_timemap_problem_ids(self):
        assert normalize_timemap_problem_ids('problem-1') == ['problem-1']
        assert normalize_timemap_problem_ids(['a', 'b']) == ['a', 'b']
        assert normalize_timemap_problem_ids([]) == []


class TestAuthorView:
    def test_author_view_renders_without_javascript(self):
        block = _make_block(
            video_id='video-123',
            timemap='{"1:30": "problem-1"}',
        )
        fragment = block.author_view()
        assert 'in-video-quiz-studio-author' in fragment.content
        assert 'wrapper-xblock-message' not in fragment.content
        assert 'xblock-message' not in fragment.content
        assert 'video-123' in fragment.content
        assert 'problem-1' in fragment.content
        assert '<pre' not in fragment.content
        assert 'InVideoQuizXBlock' not in (fragment.foot_html() or '')

    def test_author_view_shows_friendly_schedule_not_raw_json(self):
        block = _make_block(
            video_id='video-123',
            timemap=(
                '{"1:30": "problem-1", "2:00": ["problem-2", "problem-3"]}'
            ),
        )
        fragment = block.author_view()
        assert 'in-video-quiz-studio-schedule' in fragment.content
        assert 'Questions appear during video playback at:' in fragment.content
        assert '<pre' not in fragment.content
        assert 'timemap' not in fragment.content.lower()

    def test_author_view_empty_state(self):
        block = _make_block()
        fragment = block.author_view()
        assert 'No in-video quiz configured yet' in fragment.content
        assert '<pre' not in fragment.content

    def test_author_view_resolves_sibling_display_names(self):
        video_child = Mock()
        video_child.location = Mock(
            block_id='video-123',
            __str__=Mock(
                return_value='block-v1:edX+test+type@video+block@video-123'
            ),
        )
        video_child.display_name_with_default = 'Introduction Video'

        problem_child = Mock()
        problem_child.location = Mock(
            block_id='problem-1',
            __str__=Mock(
                return_value='block-v1:edX+test+type@problem+block@problem-1'
            ),
        )
        problem_child.display_name_with_default = 'Check Your Understanding'

        parent = Mock()
        parent.get_children = Mock(return_value=[video_child, problem_child])

        block = _make_block(
            video_id='video-123',
            timemap='{"00:10": "problem-1"}',
        )

        fragment = block.author_view(context={'root_xblock': parent})
        assert 'Introduction Video' in fragment.content
        assert 'Check Your Understanding' in fragment.content
        assert '0:10' in fragment.content
        assert 'video-123' not in fragment.content
        assert 'problem-1' not in fragment.content

    def test_author_view_resolves_siblings_via_root_xblock_context(self):
        """Studio container preview passes root_xblock for sibling lookup."""
        video_child = Mock()
        video_child.location = Mock(
            block_id='video-abc',
            __str__=Mock(
                return_value='block-v1:edX+test+type@video+block@video-abc'
            ),
        )
        video_child.display_name_with_default = 'Demo Video'

        root = Mock()
        root.get_children = Mock(return_value=[video_child])

        block = _make_block(video_id='video-abc')
        fragment = block.author_view(context={'root_xblock': root})

        assert 'Demo Video' in fragment.content
        assert 'video-abc' not in fragment.content
        root.get_children.assert_called_once()

    def test_author_view_resolves_siblings_via_modulestore(self):
        """Plugin XBlocks resolve sibling names from modulestore on unit
        pages."""
        video_child = Mock()
        video_child.location = Mock(
            block_id='60aacafbedd04c8cb187ca72a9350a8a',
            __str__=Mock(
                return_value=(
                    'block-v1:edX+test+type@video+block@'
                    '60aacafbedd04c8cb187ca72a9350a8a'
                ),
            ),
        )
        video_child.display_name_with_default = 'video2'

        problem_child = Mock()
        problem_child.location = Mock(
            block_id='b1cb02a9ce9b4474ba7b2964ce573f4c',
            __str__=Mock(
                return_value=(
                    'block-v1:edX+test+type@problem+block@'
                    'b1cb02a9ce9b4474ba7b2964ce573f4c'
                ),
            ),
        )
        problem_child.display_name_with_default = 'Problem 1'

        parent = Mock()
        parent.get_children = Mock(return_value=[video_child, problem_child])

        store = Mock()
        store.get_parent_location = Mock(return_value='vertical-loc')
        store.get_item = Mock(return_value=parent)

        block = _make_block(
            video_id='60aacafbedd04c8cb187ca72a9350a8a',
            timemap=(
                '{"00:10": "b1cb02a9ce9b4474ba7b2964ce573f4c"}'
            ),
        )
        block.scope_ids.usage_id = Mock()
        block._get_modulestore = Mock(
            return_value=store)  # pylint: disable=protected-access
        block._get_draft_usage_key = Mock(
            return_value='invideoquiz-loc')  # pylint: disable=protected-access

        fragment = block.author_view()

        assert 'video2' in fragment.content
        assert 'Problem 1' in fragment.content
        assert '60aacafbedd04c8cb187ca72a9350a8a' not in fragment.content
        assert 'b1cb02a9ce9b4474ba7b2964ce573f4c' not in fragment.content
        store.get_parent_location.assert_called_once_with('invideoquiz-loc')
        store.get_item.assert_called_once_with('vertical-loc')

    def test_author_view_resolves_siblings_via_direct_usage_key_lookup(self):
        """Resolve problem titles via direct modulestore lookup when sibling
        map fails."""
        invideoquiz_key = MagicMock()
        invideoquiz_key.branch = None
        invideoquiz_key.__str__ = Mock(
            return_value=(
                'block-v1:edX+test+2026_Q5+type@invideoquiz+block@quiz1'
            ),
        )

        problem = Mock()
        problem.location = Mock(
            block_id='b1cb02a9ce9b4474ba7b2964ce573f4c',
            __str__=Mock(
                return_value=(
                    'block-v1:edX+test+2026_Q5+type@problem+block@'
                    'b1cb02a9ce9b4474ba7b2964ce573f4c'
                ),
            ),
        )
        problem.display_name_with_default = 'Problem 1'

        store = Mock()
        store.get_parent_location = Mock(return_value=None)
        store.get_item = Mock(return_value=problem)

        block = _make_block(
            timemap=(
                '{"00:10": "b1cb02a9ce9b4474ba7b2964ce573f4c"}'
            ),
        )
        block.location = invideoquiz_key
        block._get_modulestore = Mock(
            return_value=store)  # pylint: disable=protected-access
        block._get_draft_usage_key = Mock(
            return_value=invideoquiz_key)  # pylint: disable=protected-access
        block._build_sibling_usage_key = Mock(
            return_value='problem-loc')  # pylint: disable=protected-access

        fragment = block.author_view()

        assert 'Problem 1' in fragment.content
        assert 'b1cb02a9ce9b4474ba7b2964ce573f4c' not in fragment.content
        store.get_item.assert_called()

    def test_has_author_view_flag(self):
        block = _make_block()
        assert block.has_author_view is True


class TestStudentViewConfig:
    @staticmethod
    def _config_javascript(fragment):
        return fragment.foot_html()

    def test_config_includes_legacy_timemap_and_per_problem_jump_back(self):
        block = _make_block(
            video_id='video-123',
            timemap='{"1:30": ["problem-1", "problem-2"]}',
            jump_back='{"problem-1": "1:29", "problem-2": "1:45"}',
        )
        fragment = block.student_view()
        javascript = self._config_javascript(fragment)
        assert 'video-123' in javascript
        assert 'problem-1' in javascript
        assert '1:45' in javascript
        assert '1:30' in javascript

    def test_config_supports_legacy_global_jump_back_string(self):
        block = _make_block(
            video_id='video-abc',
            timemap='{"1:30": "problem-1"}',
            jump_back='1:29',
        )
        fragment = block.student_view()
        javascript = self._config_javascript(fragment)
        assert 'jumpBack' in javascript
        assert '1:29' in javascript

    def test_config_handles_empty_jump_back(self):
        block = _make_block(
            video_id='video-abc',
            timemap='{"1:30": "problem-1"}',
            jump_back='',
        )
        fragment = block.student_view()
        javascript = self._config_javascript(fragment)
        assert 'jumpBack' in javascript
        assert 'timemap' in javascript

    def test_config_timemap_is_valid_json_object_literal(self):
        block = _make_block(
            video_id='video-xyz',
            timemap='{"1:30": ["a", "b"]}',
            jump_back='{}',
        )
        fragment = block.student_view()
        javascript = self._config_javascript(fragment)
        timemap_line = next(
            line for line in javascript.splitlines() if 'timemap:' in line
        )
        timemap_json = timemap_line.split('timemap:', 1)[1].strip().rstrip(',')
        parsed = json.loads(timemap_json)
        assert parsed == {'1:30': ['a', 'b']}
