"""Run with: uv run python -m supportops.notification_worker"""
import logging
import time

from .notifications import run_once


def main():
    logging.basicConfig(level=logging.INFO)
    # HTTP client request logs include the secret webhook URL.
    logging.getLogger('httpx').setLevel(logging.WARNING)
    logging.getLogger('httpcore').setLevel(logging.WARNING)
    log = logging.getLogger('supportops.notification_worker')
    while True:
        try:
            if not run_once():
                time.sleep(2)
        except KeyboardInterrupt:
            return
        except Exception as error:
            # Exception text could include connection credentials; log only the type.
            log.warning('notification_worker_error type=%s', type(error).__name__)
            time.sleep(5)


if __name__ == '__main__':
    main()
