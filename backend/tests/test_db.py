"""Connection recovery without replaying application transactions."""
import os
import unittest
from unittest.mock import MagicMock, patch

from psycopg import OperationalError
from supportops import db
from supportops.config import Settings


class TransactionTests(unittest.TestCase):
    def test_connection_failure_does_not_replay_transaction_body(self):
        pool = MagicMock()
        connection = pool.connection.return_value.__enter__.return_value
        calls = []
        with patch.object(db, 'pool', return_value=pool):
            with self.assertRaises(OperationalError):
                with db.transaction():
                    calls.append('application work')
                    raise OperationalError('connection lost during work')
        self.assertEqual(calls, ['application work'])
        pool.connection.assert_called_once()
        connection.transaction.assert_called_once()


@unittest.skipUnless(os.getenv('TEST_DATABASE_URL'), 'Requires a test database connection')
class PoolRecoveryTests(unittest.TestCase):
    def test_closed_idle_connection_is_replaced_before_transaction(self):
        config = Settings(_env_file=None, database_url=os.environ['TEST_DATABASE_URL'])
        # Call the uncached factory so this test never replaces the app's pool.
        with patch.object(db, 'settings', return_value=config):
            pool = db.pool.__wrapped__()
        try:
            with pool.connection() as connection:
                self.assertEqual(connection.execute('SELECT 1 AS value').fetchone()['value'], 1)
            # Simulate a connection becoming unusable while waiting in the pool.
            connection.close()
            with patch.object(db, 'pool', return_value=pool):
                with db.transaction() as replacement:
                    self.assertIsNot(replacement, connection)
                    self.assertEqual(replacement.execute('SELECT 1 AS value').fetchone()['value'], 1)
        finally:
            pool.close()


if __name__ == '__main__':
    unittest.main()
