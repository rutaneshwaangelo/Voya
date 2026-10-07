# 🚗 VOYA — Ride Smart. Arrive Safe. Move Beyond Limits.

> **Rwanda's Premium Urban Mobility & Ride-Hailing Platform**  
> Built with **Node.js**, **MongoDB (Mongoose)**, **React.js**, and pure **Vanilla CSS**.

---

## 🌟 Key Platform Features

1. **Near-Instant Driver Matching**:
   - Target matching countdown of **~2 seconds** across Kigali.
   - Transparent fare estimates based on actual travel distance (Haversine formula).
   - **80% Driver Net Earnings / 20% VOYA Flat Commission** split.

2. **Real-Time Live Map (Leaflet.js)**:
   - Interactive Kigali landmarks (Kigali Heights, Convention Centre, Airport, Nyabugogo, Downtown, Kimironko, Stadium) + tap to pin coordinates.
   - Live custom markers for drivers, passengers, and animated route visualization.
   - **Admin Real-Time Fleet Map**: Shows all online drivers in Kigali with real-time GPS coordinates, vehicle details, and active passenger journeys.

3. **Strict Driver Rules & Document Verification**:
   - **MTN Rwanda Only**: Drivers **must** register with an MTN phone number (`078` or `079`). Airtel numbers are strictly rejected during driver signup.
   - Driver documentation: Driving License, 16-digit Rwanda National ID, Vehicle Plate Number (e.g. `RAA 123 A`), Vehicle Type & Photo, and MTN MoMo payout phone.
   - Initial status: `pending` until approved by VOYA Admin.
   - Driver controls: Online/Offline toggle, Auto-online mode between rides, step-by-step trip workflow ("Arrived" ➔ "Start Trip" ➔ "Complete Trip"), GPS route simulation, and earnings wallet.

4. **Speech & Voice Assistant**:
   - Built-in hands-free Web Speech API assistant.
   - Voice commands: *"Book a ride"*, *"Where is my driver?"*, *"Cancel trip"*, *"Go to Airport"*.
   - Instant audio voice feedback response.

5. **Local Rwandan Mobile Payments**:
   - Supported methods: **MTN Mobile Money (MoMo)** and **Airtel Money**.
   - Security: **6-digit SMS verification code** system with a 5-minute expiry timer and max 3 attempts limit.
   - Split ledger calculation: 80% to Driver wallet / 20% VOYA commission.
   - SMS receipt with unique transaction reference.

6. **Password Recovery & Multi-Identifier Auth**:
   - Passengers and drivers can log in with **Email**, **Phone number**, OR **Username**.
   - Forgot Password supports recovery via Email or Phone with a **6-digit SMS code** before resetting the password.
   - bcrypt password hashing & JWT token authentication.

---

## 📁 Project Architecture

```
VOYA/
├── BACK_END/
│   ├── .env                      # Database URI, JWT Secret, Port
│   ├── package.json              # Node.js ES Modules ("type": "module")
│   ├── server.js                 # Express server & API routes mount
│   ├── config/
│   │   └── db.js                 # MongoDB connection with Mongoose
│   ├── models/
│   │   ├── User.js               # Passenger, Driver, Admin schema
│   │   ├── Ride.js               # Ride lifecycle & live location schema
│   │   └── Payment.js            # MoMo / Airtel payment & 80/20 split schema
│   ├── middleware/
│   │   └── auth.js               # JWT authentication & role authorization
│   ├── routes/
│   │   ├── auth.js               # Login, Register (MTN driver check), Forgot Password
│   │   ├── rides.js              # Request, Accept, Status update, Approve, History
│   │   ├── drivers.js            # Online toggle, Auto-online, Earnings wallet
│   │   ├── admin.js              # Real-time fleet live map, Driver approvals, Ledger
│   │   └── payments.js           # MoMo/Airtel initiation, 6-digit SMS verification
│   └── services/
│       └── smsService.js         # Simulated SMS gateway for codes & receipts
│
└── FRONT_END/
    ├── index.html                # React 18 + Leaflet + Outfit/Inter fonts
    ├── images/
    │   └── logo.png              # Official VOYA Brand Logo
    ├── css/
    │   └── styles.css            # Pure Vanilla CSS (Luxury Rwanda Emerald & Gold)
    └── js/
        ├── api.js                # Frontend API client
        ├── App.jsx               # Root React application & state router
        └── components/
            ├── Navbar.jsx        # Role switch, logo, online toggle, voice mic
            ├── LiveMap.jsx       # Leaflet interactive map with custom Kigali markers
            ├── PassengerView.jsx # Booking card, landmark presets, trip tracker
            ├── DriverView.jsx    # Online switch, incoming ride radar, 80% wallet
            ├── AdminView.jsx     # Real-time fleet live map, driver verification queue
            ├── PaymentModal.jsx  # MTN MoMo / Airtel 6-digit SMS verification modal
            ├── AuthModal.jsx     # Login, Register (MTN validation), Password reset
            └── VoiceAssistant.jsx# Speech recognition & text-to-speech feedback
```

---

## 🚀 How to Run the Platform

### 1. Start MongoDB (Local)
Make sure MongoDB is running on your machine:
```bash
# Windows command prompt / PowerShell:
net start MongoDB
# Or run mongod directly:
mongod
```
*(Default URI: `mongodb://127.0.0.1:27017/voya_db`)*

### 2. Start Backend Server with pnpm
```bash
cd BACK_END
pnpm run dev
# Or: pnpm start
```
The backend will run on **http://localhost:5000**.
On startup, it automatically seeds the default Master Admin account if one does not exist:
- **Admin Phone**: `0780000000`
- **Admin Email**: `admin@voya.rw`
- **Admin Password**: `admin123`

### 3. Open VOYA in Browser
Simply open:
👉 **http://localhost:5000**

The Express server automatically serves the React frontend, so both backend API and frontend work seamlessly on port 5000!

---

## 🛡️ Default Test Accounts

| Role | Identifier (Phone/Email/Username) | Password | Notes |
|---|---|---|---|
| **Master Admin** | `0780000000` or `admin@voya.rw` | `admin123` | Full access to Real-time Fleet Map, Driver Approvals, Ledger |
| **New Driver** | Registered with any MTN number (`078...` or `079...`) | User set | Starts as `pending` until approved in Admin Portal |
| **New Passenger** | Registered with any phone or email | User set | Ready to book immediately |
