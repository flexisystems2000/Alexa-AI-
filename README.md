# Alexa AI 🤖
**The Next Generation of Intelligent Automation**
Alexa AI is a premium, cloud-based WhatsApp assistant engineered to redefine how you interact with your digital workspace. Designed for high performance, reliability, and ease of use, Alexa AI acts as an intelligent bridge between your WhatsApp chats and your custom backend, **Flexi-AI**.
---
### 💡 A Note on Evolution
**Alexa AI is the official successor to the JARVIS AI project.** Originally developed by **Flexi Digital Academy** as a private utility for academy members, Alexa AI has been completely re-architected to serve as a robust, public-facing assistant. While it retains all the powerful automation, moderation, and AI capabilities of its predecessor, it features a more stable, cloud-optimized engine built for modern deployment.
---
## 🚀 Key Features
* **Flexi-AI Brain:** Intelligent, context-aware responses powered by your custom backend server.
* **Persistent Session:** Utilizing **Firebase RTDB (RemoteAuth)**, your session survives server redeployments and restarts seamlessly.
* **Smart Automation:** Built-in sophisticated safeguards to keep your groups clean, professional, and spam-free.
* **Multimodal Processing:** Seamless handling of images, videos, audio, and document analysis.
* **Cloud-Optimized:** Fully compatible with platforms like Render, utilizing a headless browser architecture for 24/7 reliability.
---
## 🛠 Command List
### General & User Commands

| Command | Description |
| :--- | :--- |
| `!menu` | Displays the comprehensive list of all bot categories and features. |
| `!ai [query]` | Interacts directly with the AI brain for advanced queries. |
| `!ping` | Checks system latency and real-time responsiveness. |
| `!status` | Returns current uptime, memory usage, and connection health. |
| `!image` | Generates or analyzes images based on input. |
| `!yt [url]` | Fetches information or provides links for YouTube content. |
| `!tiktok [url]` | Processes or fetches data from TikTok media links. |
| `!music [query]` | Searches for and retrieves music tracks or audio content. |
| `!quiz` | Starts an interactive quiz session for academic or entertainment purposes. |

### Group Administration

| Command | Description |
| :--- | :--- |
| `!kick @user` | Removes a specific participant from the group. |
| `!add [number]` | Adds a new member to the group by number. |
| `!ginfo` | Retrieves detailed metadata about the active group. |
| `!gJID` | Displays the unique Group JID for technical and developer configuration. |
| `!mute` | Mutes the group to restrict general messaging. |
| `!unmute` | Restores standard group communication privileges. |
| `!mute [time]` | Mutes the group for a set duration (e.g., 30s, 10m, 2h). |
| `!unmute [time]` | Schedules an automated unmute action. |
| `!listonline` | Lists all members currently active in the group. |
| `!time` | Provides the exact server time and date. |

### Automated Protection & Security
* **Antilink:** Automatically detects and removes unauthorized links to prevent spam.
* **Antispam:** Monitors message flow to prevent flooding and bot abuse.
* **Antibadword:** Automatically filters and deletes messages containing restricted or offensive language.
* **Anti-Sticker:** Curates or filters automated sticker spam to keep chats clean.
* **Antigm:** Prevents sensitive group mentions from leaking into private status updates.
* **Automated Welcome/Goodbye:** Professional, customizable greetings for new members and farewell notifications for those exiting.
---
## ⚙️ Setup & Deployment
1. **Clone the Repo:** `git clone https://github.com/flexisystems2000/alexa-ai.git`
2. **Install Dependencies:** Run `npm install` in your terminal.
3. **Configure Environment:** Create a `.env` file containing:
   - `FIREBASE_SERVICE_ACCOUNT`: Your Firebase configuration key.
   - `FLEXI_AI_ENDPOINT`: The URL of your AI server.
4. **Deploy:** Push your code to Render. Ensure your environment is configured to support **Puppeteer/Chromium**.
5. **Monitor:** Track logs via the Render dashboard to ensure the bot remains connected to your WhatsApp instance.
---
## 🛡 License & Credit
This project is licensed under the **MIT License**. 
Developed with passion by **Flexi Digital Academy**. Alexa AI serves as the definitive replacement for the legacy JARVIS AI project, offering enhanced stability and expanded functionality for the modern user.
## 💡 Built With
* [Node.js](https://nodejs.org/)
* [whatsapp-web.js](https://github.com/pedroslopez/whatsapp-web.js)
* [Firebase Admin](https://firebase.google.com/)
* [Axios](https://axios-http.com/)
