# 🧠 Quizix Pro - Advanced Interactive Quiz Platform

A sophisticated quiz platform that runs locally on your network, featuring LaTeX equations, image support, multiple question types, and advanced scoring mechanics.

## 🚀 Features

### Core Functionality
- **Real-time Multiplayer**: Multiple players can join using a simple PIN
- **Advanced Quiz Creation**: Support for multiple question types and rich content
- **Live Scoring**: Real-time points and leaderboards with time-based bonuses
- **Host & Player Views**: Separate interfaces optimized for each role
- **Local Network**: No internet required - runs entirely on your local network
- **Cross-Device**: Works on phones, tablets, and computers
- **Responsive Design**: Adapts to different screen sizes

### Question Types
- **Multiple Choice**: Traditional A/B/C/D questions
- **Multiple Correct Answers**: Select all that apply questions
- **True/False**: Simple binary choice questions
- **Numeric Input**: Mathematical calculations with tolerance settings

### Rich Content Support
- **LaTeX Equations**: Full mathematical notation support ($x^2 + y^2 = z^2$)
- **Image Questions**: Upload and display images in questions
- **Enhanced Timing**: Automatic answer revelation when time expires
- **No Spoilers**: Correct answers hidden until timer ends

## 🛠️ Installation

1. **Install Node.js** (version 14 or higher)
   - Download from [nodejs.org](https://nodejs.org/)

2. **Install Dependencies**
   ```bash
   npm install
   ```
   
   Dependencies include:
   - Express.js for web server
   - Socket.IO for real-time communication
   - Multer for image upload handling
   - MathJax for LaTeX equation rendering

## 🏃‍♂️ Running the Game

1. **Start the Server**
   ```bash
   npm start
   ```
   
   For development with auto-restart:
   ```bash
   npm run dev
   ```

2. **Access the Game**
   - **Local access**: Open `http://localhost:3000` on the host computer
   - **Network access**: Open `http://[YOUR_LOCAL_IP]:3000` on any device

3. **Find Your Local IP Address**
   - **Windows**: Run `ipconfig` in Command Prompt, look for "IPv4 Address"
   - **Mac/Linux**: Run `ifconfig` or `ip addr show` in Terminal
   - **Example**: If your IP is 192.168.1.100, players access `http://192.168.1.100:3000`

## 🎮 How to Play

### For Hosts:
1. Click "Host a Game"
2. Create your quiz with multiple question types:
   - **Multiple Choice**: Traditional 4-option questions
   - **Multiple Correct**: Select all correct answers
   - **True/False**: Binary choice questions
   - **Numeric**: Mathematical input with tolerance
3. Add rich content:
   - LaTeX equations: `$f(x) = x^2 + 2x + 1$`
   - Upload images for visual questions
4. Click "Start Game" to generate a PIN
5. Share the PIN with players
6. Questions automatically progress when time expires
7. View real-time results and leaderboards

### For Players:
1. Click "Join Game"
2. Enter the game PIN and your name
3. Wait for the host to start
4. Answer questions using the appropriate interface:
   - Tap options for multiple choice
   - Check boxes for multiple correct answers
   - Tap TRUE/FALSE for binary questions
   - Type numbers for numeric questions
5. See your score and ranking after each question

## 🔧 Configuration

### Changing the Port
Set the `PORT` environment variable:
```bash
PORT=8080 npm start
```

### Network Settings
The server binds to `0.0.0.0` by default, making it accessible from any device on your local network. This is safe for local use but shouldn't be exposed to the internet.

## 📱 Device Compatibility

- **Computers**: Any modern web browser
- **Mobile Devices**: iOS Safari, Android Chrome, etc.
- **Tablets**: Full support with responsive design
- **No App Required**: Everything runs in the web browser

## 🎨 Customization

### Adding More Question Types
Edit `server.js` to support additional question formats:
- True/False questions
- Image-based questions
- Text input questions

### Styling
Modify `public/styles.css` to change:
- Colors and themes
- Fonts and layouts
- Animations and effects

### Game Logic
Update `public/script.js` to adjust:
- Scoring algorithms
- Timer settings
- Game flow

## 🐛 Troubleshooting

### Can't Connect from Other Devices
1. Check that all devices are on the same WiFi network
2. Verify your local IP address is correct
3. Temporarily disable firewall on the host computer
4. Try a different port if 3000 is blocked

### Game Not Loading
1. Ensure Node.js is installed correctly
2. Run `npm install` again
3. Check for any error messages in the terminal
4. Try accessing `http://localhost:3000` first

### Players Can't Join
1. Verify the game PIN is correct
2. Make sure the host has started hosting (not just created questions)
3. Check that the game hasn't already started

## 🔒 Security Notes

- This application is designed for local network use only
- Don't expose it to the internet without proper security measures
- No user data is permanently stored
- All game data is cleared when the server restarts

## 🤝 Contributing

Feel free to fork this project and add your own features:
- Sound effects and music
- More question types
- Team-based gameplay
- Save/load quiz functionality
- Statistics and analytics

## 📝 License

MIT License - Feel free to use and modify for your needs.

---

**Enjoy your local quiz games! 🎉**