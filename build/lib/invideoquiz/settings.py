"""
Settings for in-video-quiz xblock
"""

DATABASES = {
    'default': {
        'ENGINE': 'django.db.backends.sqlite3',
        # 'NAME': 'intentionally-omitted',
    },
}

SECRET_KEY = 'invideoquiz_SECRET_KEY'
DEFAULT_AUTO_FIELD = 'django.db.models.AutoField'
