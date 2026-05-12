import { NavLink, Outlet } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { useTheme } from '../contexts/ThemeContext';

const navItems = [
  { to: '/today', label: 'Report', icon: '📝' },
  { to: '/calendar', label: 'Calendar', icon: '📅' },
  { to: '/habits', label: 'Habits', icon: '⚙️' },
];

export default function Layout() {
  const { user, signOut } = useAuth();
  const { theme, toggleTheme } = useTheme();

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-950 flex flex-col">
      {/* Top bar */}
      <header className="bg-white dark:bg-gray-900 border-b border-gray-200 dark:border-gray-700 px-4 py-3 flex items-center justify-between shrink-0">
        <h1 className="text-lg font-bold text-indigo-600">Habit Tracker</h1>
        <div className="flex items-center gap-3">
          <button
            onClick={toggleTheme}
            className="text-lg text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors"
            title={`Switch to ${theme === 'light' ? 'dark' : 'light'} mode`}
          >
            {theme === 'light' ? '🌙' : '☀️'}
          </button>
          <span className="text-sm text-gray-500 dark:text-gray-400 hidden sm:inline">
            {user?.email}
          </span>
          <button
            onClick={signOut}
            className="text-sm text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors"
          >
            Sign Out
          </button>
        </div>
      </header>

      {/* Main content area */}
      <main className="flex-1 overflow-y-auto">
        <Outlet />
      </main>

      {/* Bottom navigation */}
      <nav className="bg-white dark:bg-gray-900 border-t border-gray-200 dark:border-gray-700 shrink-0">
        <div className="max-w-2xl mx-auto flex">
          {navItems.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              className={({ isActive }) =>
                `flex-1 flex flex-col items-center py-3 text-xs transition-colors ${
                  isActive
                    ? 'text-indigo-600 font-semibold'
                    : 'text-gray-400 hover:text-gray-600 dark:hover:text-gray-300'
                }`
              }
            >
              <span className="text-lg mb-0.5">{item.icon}</span>
              {item.label}
            </NavLink>
          ))}
        </div>
      </nav>
    </div>
  );
}