In Video Quiz XBlock
====================

This XBlock allows for edX components to be displayed to users inside of videos at specific time points.

Installation
------------

Install the requirements into the python virtual environment of your
``edx-platform`` installation by running the following command from the
root folder:

.. code:: bash

    $ make requirements

Enabling in Studio
------------------

You can enable the In Video Quiz XBlock in Studio through the
advanced settings.

1. From the main page of a specific course, navigate to
   ``Settings ->    Advanced Settings`` from the top menu.
2. Check for the ``advanced_modules`` policy key, and add
   ``"invideoquiz"`` to the policy value list.
3. Click the "Save changes" button.

License
-------

The In Video Quiz XBlock is available under the AGPL Version 3.0 License.
