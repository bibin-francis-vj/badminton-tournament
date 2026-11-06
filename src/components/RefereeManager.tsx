import React, { useState } from 'react';
import { UserCheck, Plus, Trash2, Eye, EyeOff, Edit2, Loader2 } from 'lucide-react';
import { useTournamentStore } from '../store/tournamentStore';
import { LoadingSpinner } from './LoadingSpinner';
import type { Referee } from '../types';
import { confirmDialog, notify } from './Dialog';

export const RefereeManager: React.FC = () => {
  const { referees, courts, addReferee, updateReferee, deleteReferee, isLoading, isInitialized } = useTournamentStore();
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState<{ [key: string]: boolean }>({});
  const [formData, setFormData] = useState({
    name: '',
    username: '',
    password: '',
    courtId: ''
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    
    try {
      if (!formData.name.trim() || !formData.username.trim() || !formData.password.trim()) {
        notify('Please fill in the name, username and password.', { tone: 'warning' });
        return;
      }

      // Check if username already exists (only for new referees or if username changed)
      const existingReferee = referees.find(ref => ref.username === formData.username);
      if (existingReferee && existingReferee.id !== editingId) {
        notify('That username is already taken. Please choose a different one.', { tone: 'warning' });
        return;
      }

      if (editingId) {
        // Update existing referee
        if (await confirmDialog({ title: 'Save changes?', message: `Update referee "${formData.name}"?`, confirmText: 'Save' })) {
          await updateReferee(editingId, {
            name: formData.name,
            username: formData.username,
            password: formData.password,
            courtId: formData.courtId || undefined
          });
          setEditingId(null);
          setFormData({ name: '', username: '', password: '', courtId: '' });
          setShowForm(false);
        }
      } else {
        // Add new referee
        const newReferee: Referee = {
          id: `referee-${Date.now()}`,
          name: formData.name,
          username: formData.username,
          password: formData.password,
          courtId: formData.courtId || undefined
        };

        await addReferee(newReferee);
        setFormData({ name: '', username: '', password: '', courtId: '' });
        setShowForm(false);
      }
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (id: string) => {
    const name = referees.find(r => r.id === id)?.name ?? 'this referee';
    if (await confirmDialog({ title: 'Delete referee?', message: `${name} will no longer be able to sign in.`, confirmText: 'Delete', tone: 'danger' })) {
      deleteReferee(id);
    }
  };

  const handleEdit = (referee: Referee) => {
    setEditingId(referee.id);
    setFormData({
      name: referee.name,
      username: referee.username,
      password: referee.password,
      courtId: referee.courtId || ''
    });
    setShowForm(true);
  };

  const handleCancelEdit = () => {
    setEditingId(null);
    setFormData({ name: '', username: '', password: '', courtId: '' });
    setShowForm(false);
  };

  const togglePasswordVisibility = (refereeId: string) => {
    setShowPassword(prev => ({
      ...prev,
      [refereeId]: !prev[refereeId]
    }));
  };

  const getCourtName = (courtId: string | undefined) => {
    if (!courtId) return 'Unassigned';
    const court = courts.find(c => c.id === courtId);
    return court ? court.name : 'Unassigned';
  };

  // Show loader during initial data fetch
  if (isLoading && !isInitialized) {
    return <LoadingSpinner size="lg" text="Loading Referees..." />;
  }

  return (
    <div className="space-y-4 sm:space-y-6">
      <div className="flex justify-between items-center gap-3">
        <div className="min-w-0">
          <h2 className="text-lg sm:text-2xl font-bold text-gray-800 flex items-center gap-2">
            <UserCheck className="w-6 h-6 sm:w-7 sm:h-7 text-blue-600 flex-shrink-0" />
            Referee Management
          </h2>
          <p className="hidden sm:block text-gray-600 mt-1">Create and manage referee accounts</p>
        </div>
        <button
          onClick={() => setShowForm(!showForm)}
          className="bg-blue-600 text-white px-3 sm:px-4 py-2 rounded-lg hover:bg-blue-700 transition flex items-center gap-2 flex-shrink-0"
        >
          <Plus className="w-5 h-5" />
          Add Referee
        </button>
      </div>

      {/* Add/Edit Referee Form */}
      {showForm && (
        <div className="bg-white rounded-lg shadow-md p-4 sm:p-6">
          <h3 className="text-lg sm:text-xl font-semibold mb-4">
            {editingId ? 'Edit Referee' : 'Create New Referee'}
          </h3>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Name <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                placeholder="Enter referee name"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Username <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                value={formData.username}
                onChange={(e) => setFormData({ ...formData, username: e.target.value })}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                placeholder="Enter username (for login)"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Password <span className="text-red-500">*</span>
              </label>
              <input
                type="password"
                value={formData.password}
                onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                placeholder="Enter password"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Assign to Court (Optional)
              </label>
              <select
                value={formData.courtId}
                onChange={(e) => setFormData({ ...formData, courtId: e.target.value })}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              >
                <option value="">Unassigned</option>
                {courts.map(court => (
                  <option key={court.id} value={court.id}>
                    {court.name}
                  </option>
                ))}
              </select>
            </div>

            <div className="flex gap-2">
              <button
                type="submit"
                disabled={loading}
                className="flex-1 sm:flex-none justify-center bg-green-600 text-white px-6 py-3 sm:py-2 rounded-lg hover:bg-green-700 transition disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
              >
                {loading && <Loader2 className="w-4 h-4 animate-spin" />}
                {editingId ? 'Update Referee' : 'Create Referee'}
              </button>
              <button
                type="button"
                onClick={handleCancelEdit}
                disabled={loading}
                className="flex-1 sm:flex-none bg-gray-500 text-white px-6 py-3 sm:py-2 rounded-lg hover:bg-gray-600 transition disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Cancel
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Referees List */}
      <div className="bg-white rounded-lg shadow-md overflow-hidden">
        {referees.length === 0 ? (
          <div className="p-8 text-center text-gray-500">
            <UserCheck className="w-16 h-16 mx-auto mb-4 opacity-50" />
            <p className="text-lg">No referees yet. Click "Add Referee" to create one.</p>
          </div>
        ) : (
          <>
          {/* Card list (phones) */}
          <ul className="md:hidden divide-y divide-gray-200">
            {referees.map((referee) => (
              <li key={referee.id} className="p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="font-semibold text-gray-900 break-words">{referee.name}</div>
                    <div className="text-sm text-gray-600 break-all">@{referee.username}</div>
                  </div>
                  <div className="flex gap-1 flex-shrink-0 -mr-2 -mt-1">
                    <button
                      onClick={() => handleEdit(referee)}
                      aria-label="Edit referee"
                      className="p-2.5 rounded-lg text-blue-600 hover:bg-blue-50 transition"
                    >
                      <Edit2 className="w-5 h-5" />
                    </button>
                    <button
                      onClick={() => handleDelete(referee.id)}
                      aria-label="Delete referee"
                      className="p-2.5 rounded-lg text-red-600 hover:bg-red-50 transition"
                    >
                      <Trash2 className="w-5 h-5" />
                    </button>
                  </div>
                </div>
                <div className="mt-3 flex flex-wrap items-center gap-2">
                  <span className={`px-3 py-1 rounded-full text-sm ${
                    referee.courtId
                      ? 'bg-green-100 text-green-800'
                      : 'bg-gray-100 text-gray-600'
                  }`}>
                    {getCourtName(referee.courtId)}
                  </span>
                  <div className="flex items-center gap-1">
                    <code className="text-sm text-gray-800 bg-gray-100 px-2 py-1 rounded break-all">
                      {showPassword[referee.id] ? referee.password : '••••••••'}
                    </code>
                    <button
                      onClick={() => togglePasswordVisibility(referee.id)}
                      aria-label={showPassword[referee.id] ? 'Hide password' : 'Show password'}
                      className="p-2 text-gray-500 hover:text-gray-700"
                    >
                      {showPassword[referee.id] ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>
              </li>
            ))}
          </ul>

          {/* Table (tablet/desktop) */}
          <div className="hidden md:block overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Name
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Username
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Password
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Assigned Court
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {referees.map((referee) => (
                  <tr key={referee.id} className="hover:bg-gray-50">
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="font-medium text-gray-900">{referee.name}</div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-gray-600">{referee.username}</div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="flex items-center gap-2">
                        <code className="text-sm text-gray-800 bg-gray-100 px-2 py-1 rounded">
                          {showPassword[referee.id] ? referee.password : '••••••••'}
                        </code>
                        <button
                          onClick={() => togglePasswordVisibility(referee.id)}
                          className="text-gray-500 hover:text-gray-700"
                        >
                          {showPassword[referee.id] ? (
                            <EyeOff className="w-4 h-4" />
                          ) : (
                            <Eye className="w-4 h-4" />
                          )}
                        </button>
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className={`px-3 py-1 rounded-full text-sm ${
                        referee.courtId 
                          ? 'bg-green-100 text-green-800' 
                          : 'bg-gray-100 text-gray-600'
                      }`}>
                        {getCourtName(referee.courtId)}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => handleEdit(referee)}
                          className="text-blue-600 hover:text-blue-800 transition"
                          title="Edit referee"
                        >
                          <Edit2 className="w-5 h-5" />
                        </button>
                        <button
                          onClick={() => handleDelete(referee.id)}
                          className="text-red-600 hover:text-red-800 transition"
                          title="Delete referee"
                        >
                          <Trash2 className="w-5 h-5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          </>
        )}
      </div>
    </div>
  );
};
