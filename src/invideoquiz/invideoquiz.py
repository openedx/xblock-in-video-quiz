"""
This XBlock allows for edX components to be displayed to users inside of
videos at specific time points.
"""

import json
import os
from html import escape

from xblock.core import XBlock
from xblock.fields import Scope
from xblock.fields import String
from xblock.validation import ValidationMessage

try:
    from web_fragments.fragment import Fragment
except ImportError:
    # For backward compatibility with quince and earlier.
    from xblock.fragment import Fragment

try:
    from opaque_keys.edx.keys import UsageKey
except ImportError:
    UsageKey = None

try:
    from xblock.utils.studio_editable import StudioEditableXBlockMixin
    from xblock.utils.resources import ResourceLoader
except ModuleNotFoundError:
    # For backward compatibility with releases older than Quince.
    from xblockutils.studio_editable import StudioEditableXBlockMixin
    from xblockutils.resources import ResourceLoader

try:
    from xmodule.modulestore import ModuleStoreEnum
except ImportError:
    ModuleStoreEnum = None

try:
    from xmodule.modulestore.django import modulestore
except ImportError:
    modulestore = None


from .utils import _

resource_loader = ResourceLoader(__name__)


def get_resource_string(path):
    """
    Retrieve string contents for the file path
    """
    path = os.path.join('public', path)
    return resource_loader.load_unicode(path)


def parse_timemap_field(raw_timemap):
    """
    Parse the timemap String field into a dict for LMS config injection.

    Supports legacy single-problem values and multi-problem arrays:
    {"1:30": "problemId1", "2:00": ["problemId2", "problemId3"]}
    """
    if not raw_timemap:
        return {}
    try:
        parsed = json.loads(raw_timemap)
    except (ValueError, TypeError):
        return {}
    return parsed if isinstance(parsed, dict) else {}


def time_sort_key(time_str):
    """
    Sort timemap keys by playback order (supports MM:SS and H:MM:SS).
    """
    text = str(time_str).strip()
    if ':' in text:
        parts = text.split(':')
        try:
            if len(parts) == 2:
                return int(parts[0]) * 60 + int(parts[1])
            if len(parts) == 3:
                return (int(parts[0]) * 3600
                        + int(parts[1]) * 60 + int(parts[2]))
        except ValueError:
            pass
    try:
        return int(text)
    except ValueError:
        return text


def format_timestamp_display(time_key):
    """
    Format a timemap key for display in Studio (e.g. 00:10 -> 0:10).
    """
    text = str(time_key).strip()
    if ':' not in text:
        try:
            total_seconds = int(text)
            minutes, seconds = divmod(total_seconds, 60)
            return f'{minutes}:{seconds:02d}'
        except ValueError:
            return text
    parts = text.split(':')
    try:
        if len(parts) == 2:
            return f'{int(parts[0])}:{int(parts[1]):02d}'
        if len(parts) == 3:
            return (
                f'{int(parts[0])}:{int(parts[1]):02d}:{int(parts[2]):02d}'
            )
    except ValueError:
        pass
    return text


def normalize_timemap_problem_ids(problem_value):
    """
    Normalize a timemap value to a list of problem ID strings.
    """
    if isinstance(problem_value, list):
        return [str(problem_id) for problem_id in problem_value if problem_id]
    if problem_value:
        return [str(problem_value)]
    return []


def parse_jump_back_field(raw_jump_back):
    """
    Parse the jump_back String field for LMS config injection.

    Supports:
    - empty / unset
    - legacy global MM:SS string (e.g. "1:29")
    - legacy time-keyed JSON object (e.g. {"1:30": "1:29"})
    - per-problem JSON object
      (e.g. {"problemId1": "1:29", "problemId2": "1:45"})
    """
    if not raw_jump_back:
        return {}
    try:
        parsed = json.loads(raw_jump_back)
    except (ValueError, TypeError):
        return raw_jump_back.strip()
    if isinstance(parsed, dict):
        return parsed
    if isinstance(parsed, str):
        return parsed
    return {}


class InVideoQuizXBlock(StudioEditableXBlockMixin, XBlock):
    """
    Display CAPA problems within a video component at a specified time.
    """

    show_in_read_only_mode = True
    has_author_view = True

    display_name = String(
        display_name=_('Display Name'),
        default=_('In-Video Quiz XBlock'),
        scope=Scope.settings,
    )

    video_id = String(
        display_name=_('Video Location'),
        default='',
        scope=Scope.settings,
        help=_(
            'This is the component ID for the video in which '
            'you want to insert your quiz questions. It can be '
            'obtained from staff debug info of the video in the LMS.'
        ),
    )

    timemap = String(
        display_name=_('Problem Timemap'),
        default='{}',
        scope=Scope.settings,
        help=_(
            'A JSON timemap of problem IDs keyed by timestamp (MM:SS). '
            'Use a string for one problem or an array for multiple problems '
            'at the same timestamp. Example: '
            '{"1:30": ["problemId1", "problemId2"], "2:00": "problemId3"} '
            'Problem IDs can be obtained from staff debug info of '
            'the problems in the LMS.'
        ),
        multiline_editor=True,
    )

    jump_back = String(
        display_name=_('Jump Back Time'),
        default='',
        scope=Scope.settings,
        help=_(
            'Time to jump back to when the learner clicks the Jump Back '
            'button (MM:SS). Provide a single MM:SS value to apply the same '
            'jump-back time to every problem, or a JSON object keyed by '
            'problem ID to give each problem its own value, e.g. '
            '{"problemId1": "1:29", "problemId2": "1:35"}. '
            'Legacy maps keyed by timestamp (e.g. {"1:30": "1:29"}) are '
            'still supported.'
        ),
    )

    editable_fields = [
        'video_id',
        'timemap',
        'jump_back',
        'display_name',
    ]

    def validate_field_data(self, validation, data):
        """
        Validate the user-submitted timemap.
        """
        try:
            json.loads(data.timemap)
        except ValueError:
            _ = self.runtime.service(self, "i18n").ugettext
            validation.add(ValidationMessage(ValidationMessage.ERROR, str(
                _("Invalid Timemap")
            )))

    def author_view(self, context=None):
        """
        Studio preview without student-facing JavaScript.

        Using author_view in Studio avoids loading InVideoQuizXBlock client
        code during vertical container initialization, which can interrupt
        initialization of sibling problem and video blocks.
        """
        context = context or {}
        fragment = Fragment(self._build_author_view_html(context))
        fragment.add_css_url(self.get_resource_url('css/invideoquiz.css'))
        return fragment

    def _get_usage_key(self):
        """
        Return this block's usage key across XBlock and XModule runtimes.
        """
        return (
            getattr(self, 'location', None)
            or getattr(self, 'usage_key', None)
            or self.scope_ids.usage_id
        )

    def _get_draft_usage_key(self):
        """
        Return the draft-branch usage key for Studio preview lookups.
        """
        usage_key = self._get_usage_key()
        if usage_key is None:
            return None
        if ModuleStoreEnum is not None and hasattr(usage_key, 'for_branch'):
            try:
                return usage_key.for_branch(ModuleStoreEnum.BranchName.draft)
            except (AttributeError, TypeError, ValueError,
                    ModuleNotFoundError):
                pass
        return usage_key

    def _get_modulestore(self):
        """
        Return the modulestore service when available in Studio/LMS runtimes.
        """
        try:
            return self.runtime.service(self, 'modulestore')
        except Exception:  # pylint: disable=broad-except
            pass
        if modulestore is not None:
            return modulestore()
        return None

    @staticmethod
    def _get_child_display_name(child):
        """
        Return a sibling block's display name, falling back to its block ID.
        """
        try:
            if hasattr(child, 'display_name_with_default'):
                name = child.display_name_with_default
                if callable(name):
                    name = name()
                if name:
                    return str(name)

            name = getattr(child, 'display_name', None)
            if name is not None and str(name).strip():
                return str(name)

            return str(child.location.block_id)
        except Exception:  # pylint: disable=broad-except
            return None

    def _load_siblings_from_modulestore(self):
        """
        Load sibling blocks from the parent unit vertical via modulestore.
        """
        store = self._get_modulestore()
        if store is None:
            return []

        usage_key = self._get_draft_usage_key()
        if usage_key is None:
            return []

        parent_locations = []
        parent_attr = getattr(self, 'parent', None)
        if parent_attr is not None:
            parent_locations.append(parent_attr)
        try:
            parent_location = store.get_parent_location(usage_key)
            if parent_location is not None:
                parent_locations.append(parent_location)
        except Exception:  # pylint: disable=broad-except
            pass

        seen_parents = set()
        siblings = []
        for parent_location in parent_locations:
            parent_key = str(parent_location)
            if parent_key in seen_parents:
                continue
            seen_parents.add(parent_key)
            try:
                parent_block = store.get_item(parent_location)
                siblings.extend(parent_block.get_children())
            except Exception:  # pylint: disable=broad-except
                continue
        return siblings

    @staticmethod
    def _component_id_matches(child, component_id):
        """
        Return whether a sibling block matches a stored component identifier.
        """
        component_id = str(component_id)
        try:
            block_id = str(child.location.block_id)
            usage_key = str(child.location)
            return (
                component_id == block_id
                or component_id in usage_key
                or usage_key.endswith(component_id)
            )
        except Exception:  # pylint: disable=broad-except
            return False

    def _build_sibling_usage_key(self, usage_key, block_type, component_id):
        """
        Build a sibling usage key from this block's course key and a block ID.
        """
        own_usage = str(usage_key)
        if UsageKey is None or '+type@' not in own_usage:
            return None
        course_prefix = own_usage.split('+type@', 1)[0]
        candidate = f'{course_prefix}+type@{block_type}+block@{component_id}'
        try:
            sibling_key = UsageKey.from_string(candidate)
            if (hasattr(sibling_key, 'for_branch')
                    and hasattr(usage_key, 'branch')
                    and usage_key.branch):
                return sibling_key.for_branch(usage_key.branch)
            if hasattr(sibling_key, 'for_branch'):
                try:
                    if ModuleStoreEnum is not None:
                        return sibling_key.for_branch(
                            ModuleStoreEnum.BranchName.draft)
                except (AttributeError, TypeError, ValueError):
                    pass
            return sibling_key
        except Exception:  # pylint: disable=broad-except
            return None

    @staticmethod
    def _format_unresolved_component_label():
        """
        Human-readable label for stale or copied component references.
        """
        return str(_('Unknown component (click Edit to reconfigure)'))

    def _lookup_component_display_name(
            self, component_id, context=None, sibling_names=None):
        """
        Resolve a configured component ID to the sibling block's display name.
        """
        if not component_id:
            return str(_('Not configured'))

        component_id = str(component_id)
        sibling_names = (sibling_names
                         or self._collect_sibling_display_names(context))
        resolved = self._resolve_component_label(component_id, sibling_names)
        if resolved != component_id:
            return resolved

        store = self._get_modulestore()
        usage_key = self._get_draft_usage_key()
        if store is None or usage_key is None:
            return component_id

        for child in self._iter_sibling_blocks(context):
            if self._component_id_matches(child, component_id):
                name = self._get_child_display_name(child)
                if name and name != component_id:
                    return name

        block_types = ('problem', 'video', 'library_content',
                       'item_bank', 'html')
        for block_type in block_types:
            sibling_key = self._build_sibling_usage_key(
                usage_key, block_type, component_id)
            if sibling_key is None:
                continue
            try:
                block = store.get_item(sibling_key)
                name = self._get_child_display_name(block)
                if name and name != component_id:
                    return name
            except Exception:  # pylint: disable=broad-except
                continue

        return component_id

    def _iter_sibling_blocks(self, context=None):
        """
        Yield sibling blocks from modulestore, Studio context, or parent
        lookup.
        """
        context = context or {}
        seen = set()

        sibling_sources = [
            self._load_siblings_from_modulestore(),
        ]

        root_xblock = context.get('root_xblock')
        if root_xblock is not None:
            try:
                sibling_sources.append(root_xblock.get_children())
            except Exception:  # pylint: disable=broad-except
                pass

        try:
            parent_block = self.get_parent()
            if parent_block is not None:
                sibling_sources.append(parent_block.get_children())
        except Exception:  # pylint: disable=broad-except
            pass

        for children in sibling_sources:
            for child in children or []:
                try:
                    usage_key = str(child.location)
                except Exception:  # pylint: disable=broad-except
                    continue
                if usage_key not in seen:
                    seen.add(usage_key)
                    yield child

    def _collect_sibling_display_names(self, context=None):
        """
        Build a lookup of sibling block IDs and usage keys to display names.
        """
        names = {}
        for child in self._iter_sibling_blocks(context):
            try:
                block_id = str(child.location.block_id)
                usage_key = str(child.location)
                display_name = self._get_child_display_name(child)
                if not display_name:
                    continue
                names[block_id] = display_name
                names[usage_key] = display_name
                # Match LMS data-id values that omit the block-v1: prefix.
                if usage_key.startswith('block-v1:'):
                    names[usage_key[len('block-v1:'):]] = display_name
            except Exception:  # pylint: disable=broad-except
                continue
        return names

    @staticmethod
    def _resolve_component_label(component_id, sibling_names):
        """
        Resolve a stored component ID to a human-readable sibling display name.
        """
        if not component_id:
            return str(_('Not configured'))
        component_id = str(component_id)
        if component_id in sibling_names:
            return sibling_names[component_id]
        for key, name in sibling_names.items():
            if component_id in key or key in component_id:
                return name
        return component_id

    def _build_quiz_schedule(self, context=None, sibling_names=None):
        """
        Build sorted timemap entries with resolved problem display names.
        """
        sibling_names = (sibling_names
                         or self._collect_sibling_display_names(context))
        timemap = parse_timemap_field(self.timemap)
        entries = []
        for time_key in sorted(timemap.keys(), key=time_sort_key):
            problem_ids = normalize_timemap_problem_ids(timemap[time_key])
            if not problem_ids:
                continue
            entries.append({
                'time': format_timestamp_display(time_key),
                'problems': [
                    self._lookup_component_display_name(
                        problem_id, context, sibling_names
                    )
                    for problem_id in problem_ids
                ],
            })
        return entries

    def _build_author_view_html(self, context=None):
        """
        Render a Studio-friendly summary of the configured in-video quiz.
        """
        context = context or {}
        sibling_names = self._collect_sibling_display_names(context)
        video_label = (
            self._lookup_component_display_name(
                self.video_id, context, sibling_names
            )
            if self.video_id
            else None
        )
        quiz_entries = self._build_quiz_schedule(context, sibling_names)

        parts = ['<div class="in-video-quiz-studio-author">']

        if not video_label and not quiz_entries:
            no_config_msg = _(
                'No in-video quiz configured yet. Click Edit to select '
                'a video and add questions.'
            )
            parts.append(
                '<p>'
                f'{escape(no_config_msg)}'
                '</p>'
            )
        else:
            if video_label:
                parts.append(
                    '<p>'
                    f'<strong>{escape(_("Video"))}:</strong> '
                    f'{escape(video_label)}'
                    '</p>'
                )
            if quiz_entries:
                msg = _('Questions appear during video '
                        'playback at:')
                parts.append(
                    '<p>'
                    f'{escape(msg)}'
                    '</p>'
                )
                parts.append('<ul class="in-video-quiz-studio-schedule">')
                for entry in quiz_entries:
                    time_label = escape(entry['time'])
                    problem_labels = ', '.join(
                        escape(problem_name)
                        for problem_name in entry['problems']
                    )
                    parts.append(
                        '<li>'
                        f'<span class="in-video-quiz-time">{time_label}</span>'
                        f' — {problem_labels}'
                        '</li>'
                    )
                parts.append('</ul>')
            parts.append(
                '<p class="in-video-quiz-studio-hint">'
                f'{escape(_("Click Edit to update quiz settings."))}'
                '</p>'
            )

        parts.append('</div>')
        return ''.join(parts)

    # Decorate the view in order to support multiple devices e.g. mobile
    # See: https://openedx.atlassian.net/wiki/display/MA/Course+Blocks+API
    # section 'View @supports(multi_device) decorator'
    @XBlock.supports('multi_device')
    def student_view(self, context=None):  # pylint: disable=unused-argument
        """
        Show to students when viewing courses
        """
        fragment = self.build_fragment(
            path_html='html/invideoquiz.html',
            paths_css=[
                'css/invideoquiz.css',
            ],
            paths_js=[
                'js/src/invideoquiz.js',
            ],
            fragment_js='InVideoQuizXBlock',
            context={
                'video_id': self.video_id,
                'user_mode': self.user_mode,
            },
        )
        config = get_resource_string('js/src/config.js')
        config = config.format(
            video_id=json.dumps(self.video_id),
            timemap=json.dumps(parse_timemap_field(self.timemap)),
            jump_back=json.dumps(parse_jump_back_field(self.jump_back)),
        )
        fragment.add_javascript(config)
        return fragment

    @property
    def user_mode(self):
        """
        Check user's permission mode for this XBlock.
        Returns:
            user permission mode
        """
        try:
            if self.xmodule_runtime.user_is_staff:
                return 'staff'
        except AttributeError:
            pass
        return 'student'

    @staticmethod
    def workbench_scenarios():
        """
        A canned scenario for display in the workbench.
        """
        return [
            ("InVideoQuizXBlock",
             """<invideoquiz video_id='###' timemap='{ 10: "###" }' />
             """),
            ("Multiple InVideoQuizXBlock",
             """<vertical_demo>
                <invideoquiz video_id='###' timemap='{ 10: "###" }' />
                <invideoquiz video_id='###' timemap='{ 10: "###" }' />
                <invideoquiz video_id='###' timemap='{ 10: "###" }' />
                </vertical_demo>
             """),
        ]

    def get_resource_url(self, path):
        """
        Retrieve a public URL for the file path
        """
        path = os.path.join('public', path)
        resource_url = self.runtime.local_resource_url(self, path)
        return resource_url

    def build_fragment(  # pylint: disable=too-many-positional-arguments
            self,
            path_html='',
            paths_css=None,
            paths_js=None,
            urls_css=None,
            urls_js=None,
            fragment_js=None,
            context=None,
    ):  # pylint: disable=too-many-arguments
        """
        Assemble the HTML, JS, and CSS for an XBlock fragment
        """
        paths_css = paths_css or []
        paths_js = paths_js or []
        urls_css = urls_css or []
        urls_js = urls_js or []
        # If no context is provided, convert self.fields into a dict
        context = context or {
            key: getattr(self, key)
            for key in self.editable_fields
        }
        html_source = get_resource_string(path_html)
        html_source = html_source.format(
            **context
        )
        fragment = Fragment(html_source)
        for path in paths_css:
            url = self.get_resource_url(path)
            fragment.add_css_url(url)
        for path in paths_js:
            url = self.get_resource_url(path)
            fragment.add_javascript_url(url)
        for url in urls_css:
            fragment.add_css_url(url)
        for url in urls_js:
            fragment.add_javascript_url(url)
        if fragment_js:
            fragment.initialize_js(fragment_js)
        return fragment
