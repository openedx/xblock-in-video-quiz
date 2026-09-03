# pylint: disable=django-not-configured
"""
Runtime will load the XBlock class from here.
"""
from importlib.metadata import PackageNotFoundError, version

from .invideoquiz import InVideoQuizXBlock

try:
    __version__ = version("invideoquiz-xblock")
except PackageNotFoundError:  # pragma: no cover
    __version__ = "unknown"
