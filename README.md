# YouSafe - Stay Safe & Secure 🛡️

YouSafe is a comprehensive personal safety application designed to empower individuals with real-time tracking, emergency alerts, and a dedicated guardian network. The project focuses on providing a reliable safety companion through a web-based interface that behaves like a native mobile app (PWA).

## 🚀 Key Features

- **Real-time Location Sharing**: Continuous location broadcasting during active sessions.
- **Multichannel SOS Alerts**: Emergency notifications via SMS, WhatsApp, and Phone calls.
- **Guardian Network**: Secure link between users and their trusted contacts.
- **Night Mode**: Enhanced tracking for high-risk situations.
- **PWA Support**: Installable on mobile devices for quick access.
- **Biometric Simulation**: Secure SOS triggering mechanism.

## 🛠️ Tech Stack & APIs

The project leverages modern web technologies and specialized APIs to ensure reliability and performance:

- **[Twilio API](https://www.twilio.com/)**: Used for sending automated SMS alerts to emergency contacts when an SOS is triggered.
- **[Socket.io](https://socket.io/)**: Powers the real-time communication layer, enabling instant location updates between the user and their guardians.
- **[Leaflet.js](https://leafletjs.com/)**: A lightweight open-source JavaScript library for interactive map visualization and marker tracking.
- **[HTML5 Geolocation API](https://developer.mozilla.org/en-US/docs/Web/API/Geolocation_API)**: Accesses high-accuracy coordinate data from the device to provide precise location tracking.
- **[Progressive Web App (PWA)](https://web.dev/progressive-web-apps/)**: Implements Service Workers and Manifest files to support offline capabilities and native-like installation.
- **[Express.js](https://expressjs.com/)**: The backend framework managing user sessions, registrations, and API routing.

## 📚 Research & Resources

The development of YouSafe was supported and inspired by the following research areas and resources:

### Research Papers & Articles
- **[A Survey on Women’s Safety Applications Using IoT and Mobile Technology](https://ieeexplore.ieee.org/document/9243501)** - Insights into the architecture of modern safety apps.
- **[Smart Women Security System using GPS and GSM](https://ieeexplore.ieee.org/document/7518928)** - Foundational research on localized emergency signaling.
- **[User-Centered Design for Safety Apps](https://dl.acm.org/doi/10.1145/3025453.3025880)** - Principles for creating intuitive emergency interfaces.

### External Documentation
- [Twilio Documentation](https://www.twilio.com/docs)
- [Socket.io Get Started Guide](https://socket.io/docs/v4/get-started/)
- [Leaflet maps documentation](https://leafletjs.com/reference.html)

## 🔗 Project Links

- **GitHub Repository**: [bhavinakhade007/YouSafe](https://github.com/bhavinakhade007/YouSafe.git)
- **Live Demo**: [YouSafe on Render](https://yousafe.onrender.com)
<!-- Placeholder for future links -->
<!-- - **Demo Video**: [Link to Video] -->
<!-- - **Extended Documentation**: [Link to Doc] -->

## 🛠️ Installation & Setup

1.  **Clone the Repository**:
    ```bash
    git clone https://github.com/bhavinakhade007/YouSafe.git
    cd YouSafe
    ```
2.  **Install Dependencies**:
    ```bash
    npm install
    ```
3.  **Environment Variables**:
    Create a `.env` file with your Twilio credentials:
    ```env
    TWILIO_SID=your_sid
    TWILIO_TOKEN=your_token
    TWILIO_NUMBER=your_twilio_number
    ```
4.  **Run Locally**:
    ```bash
    npm start
    ```
    Access the app at `http://localhost:3000`.

---
*Disclaimer: This is a prototype application. It is not directly connected to official emergency services (police/ambulance).*
