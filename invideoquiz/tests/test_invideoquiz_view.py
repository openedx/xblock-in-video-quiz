from xblock.test.tools import TestRuntime as Runtime
from xblock.runtime import DictKeyValueStore, KvsFieldData
from invideoquiz import InVideoQuizXBlock
from unittest.mock import Mock


def test_invideoquiz_model():
    """Tests for the default fields value of invideoquiz"""
    key_store = DictKeyValueStore()
    field_data = KvsFieldData(key_store)
    runtime = Runtime(services={'field-data': field_data})
    instance = InVideoQuizXBlock(runtime, scope_ids=Mock())
    assert instance.display_name == 'In-Video Quiz XBlock'
    assert instance.timemap == '{}'
    assert instance.video_id == ''
