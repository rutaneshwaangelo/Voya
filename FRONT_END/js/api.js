// ============================================================
// VOYA 2.0 - FRONTEND API CLIENT
// ============================================================

// Automatically detect whether frontend is served by backend (port 5000) or standalone (port 3000 / live-server)
const API_BASE = window.location.origin.includes('5000')
  ? '/api'
  : (window.location.protocol.startsWith('http')
      ? `${window.location.protocol}//${window.location.hostname}:5000/api`
      : 'http://localhost:5000/api');

export const api = {
  getToken() {
    return localStorage.getItem('voya_token');
  },

  setToken(token) {
    if (token) localStorage.setItem('voya_token', token);
  },

  clearToken() {
    localStorage.removeItem('voya_token');
    localStorage.removeItem('voya_user');
  },

  getUser() {
    const userStr = localStorage.getItem('voya_user');
    try {
      return userStr ? JSON.parse(userStr) : null;
    } catch {
      return null;
    }
  },

  setUser(user) {
    if (user) localStorage.setItem('voya_user', JSON.stringify(user));
  },

  async request(endpoint, options = {}) {
    const url = `${API_BASE}${endpoint}`;
    const headers = {
      'Content-Type': 'application/json',
      ...options.headers,
    };

    const token = this.getToken();
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }

    try {
      const response = await fetch(url, { ...options, headers });
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Server request failed');
      }

      return data;
    } catch (err) {
      console.error(`API Error [${endpoint}]:`, err.message);
      throw err;
    }
  },

  // Auth Methods
  async login(identifier, password) {
    const data = await this.request('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ identifier, password }),
    });
    this.setToken(data.token);
    this.setUser(data.user);
    return data;
  },

  async register(payload) {
    return this.request('/auth/register', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  },

  async forgotPassword(identifier) {
    return this.request('/auth/forgot-password', {
      method: 'POST',
      body: JSON.stringify({ identifier }),
    });
  },

  async verifyRecoveryCode(userId, code) {
    return this.request('/auth/verify-recovery-code', {
      method: 'POST',
      body: JSON.stringify({ userId, code }),
    });
  },

  async resetPassword(userId, resetToken, newPassword) {
    return this.request('/auth/reset-password', {
      method: 'POST',
      body: JSON.stringify({ userId, resetToken, newPassword }),
    });
  },

  async getProfile() {
    return this.request('/auth/me');
  },

  // Ride Methods
  async requestRide(pickup, destination, fare, distanceKm) {
    return this.request('/rides/request', {
      method: 'POST',
      body: JSON.stringify({ pickup, destination, fare, distanceKm }),
    });
  },

  async getActiveRide() {
    return this.request('/rides/active');
  },

  async getNearbyRides() {
    return this.request('/rides/nearby');
  },

  async acceptRide(rideId) {
    return this.request(`/rides/${rideId}/accept`, {
      method: 'POST',
    });
  },

  async updateRideStatus(rideId, status) {
    return this.request(`/rides/${rideId}/status`, {
      method: 'POST',
      body: JSON.stringify({ status }),
    });
  },

  async updateDriverLocation(rideId, lat, lng) {
    return this.request(`/rides/${rideId}/location`, {
      method: 'POST',
      body: JSON.stringify({ lat, lng }),
    });
  },

  async cancelRide(rideId, reason = '') {
    return this.request(`/rides/${rideId}/cancel`, {
      method: 'POST',
      body: JSON.stringify({ reason }),
    });
  },

  async approveRide(rideId, approval) {
    return this.request(`/rides/${rideId}/approve`, {
      method: 'POST',
      body: JSON.stringify({ approval }),
    });
  },

  async getRideHistory() {
    return this.request('/rides/history');
  },

  // Driver Methods
  async toggleDriverOnline(isOnline, lat = null, lng = null) {
    return this.request('/drivers/online', {
      method: 'POST',
      body: JSON.stringify({ isOnline, lat, lng }),
    });
  },

  async toggleAutoOnline(autoOnline) {
    return this.request('/drivers/auto-online', {
      method: 'POST',
      body: JSON.stringify({ autoOnline }),
    });
  },

  async getDriverWallet() {
    return this.request('/drivers/wallet');
  },

  // Admin Methods
  async getAdminLiveMap() {
    return this.request('/admin/live-map');
  },

  async getPendingDrivers() {
    return this.request('/admin/drivers/pending');
  },

  async approveDriver(driverId) {
    return this.request(`/admin/drivers/${driverId}/approve`, {
      method: 'POST',
    });
  },

  async rejectDriver(driverId) {
    return this.request(`/admin/drivers/${driverId}/reject`, {
      method: 'DELETE',
    });
  },

  async blockUser(userId) {
    return this.request(`/admin/users/${userId}/block`, {
      method: 'POST',
    });
  },

  async unblockUser(userId) {
    return this.request(`/admin/users/${userId}/unblock`, {
      method: 'POST',
    });
  },

  async getAdminMetrics() {
    return this.request('/admin/metrics');
  },

  async getAdminUsers(query = '') {
    return this.request(`/admin/users${query ? '?' + query : ''}`);
  },

  async getAdminRides() {
    return this.request('/admin/rides');
  },

  // Payment Methods
  async initiatePayment(rideId, method, phone, amount) {
    return this.request('/payments/initiate', {
      method: 'POST',
      body: JSON.stringify({ rideId, method, phone, amount }),
    });
  },

  async verifyPayment(paymentId, code) {
    return this.request('/payments/verify', {
      method: 'POST',
      body: JSON.stringify({ paymentId, code }),
    });
  },

  async resendPaymentCode(paymentId) {
    return this.request('/payments/resend-code', {
      method: 'POST',
      body: JSON.stringify({ paymentId }),
    });
  },
};

export default api;
