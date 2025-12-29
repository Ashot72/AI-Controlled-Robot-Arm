#### 🚀 Animating an AI-Controlled Robot Arm with Gemini Robotics, SVG, and GSAP

Watch an AI-controlled robot arm in action! This app uses Google’s Gemini Robotics-ER 1.5 to control an AI-powered robot arm.

The web app interprets user instructions and plans sequences of shoulder and elbow movements to complete tasks such as reaching, grabbing, and manipulating objects using the robot arm and its gripper. The gripper can open and close to pick up and release objects, allowing precise manipulation. Each trajectory is validated with Zod to ensure accuracy, and the motion is animated smoothly using SVG and GSAP.

Users can visualize multiple actions in sequence, interact with the scene, and see the AI’s motion planning in real time. The app highlights how AI can control robotic arms with precise, natural movements while providing an interactive, visually rich experience.

#### 👉 Links & Resources

- [Gemini Robotics](https://ai.google.dev/gemini-api/docs/robotics-overview)
- [GSAP](https://gsap.com)

---

#### 🚀 Clone and Run

```bash
# Clone the repository
git clone https://github.com/Ashot72/AI-Controlled-Robot-Arm

# Navigate into the project directory
cd AI-Controlled-Robot-Arm

# Copy the example `.env` file and add your Gemini API KEY
cp env.example .env

# Install dependencies
npm install

# Start the development server
npm start

# The app will be available at http://localhost:3000
```

📺 **Video:** [Watch on YouTube](https://youtu.be/skgsBdRTLSU)
