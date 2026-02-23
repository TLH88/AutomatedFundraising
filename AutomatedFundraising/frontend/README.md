# Funds 4 Furry Friends - Frontend Dashboard

A beautiful, modern dashboard for non-profit fundraising management with skeuomorphic design, glassmorphism effects, and real-time data visualization.

## 🎨 Design System

This dashboard implements the complete design specification from [docs/DESIGN_BRIEF.md](../docs/DESIGN_BRIEF.md), featuring:

- **Dark theme** with green accents (#10B981)
- **Skeuomorphic design** with deep shadows and realistic depth
- **Glassmorphism effects** with frosted glass overlays
- **Responsive 3-column grid** layout
- **Interactive charts** for fundraising trends
- **Real-time donation tracking**

## 📁 Project Structure

```
frontend/
├── index.html              # Main dashboard page
├── css/
│   ├── variables.css       # Design tokens & CSS variables
│   ├── base.css           # Reset, typography, utilities
│   ├── components.css     # Reusable UI components
│   └── layout.css         # Page structure & grid
├── js/
│   ├── main.js            # Core interactivity
│   └── chart.js           # Chart.js visualization
├── assets/
│   ├── images/            # Images & photos
│   └── icons/             # Icon files
└── components/            # Future: Modular components
```

## 🚀 Getting Started

### Option 1: Simple Local Server (Recommended)

1. **Using Python:**
   ```bash
   cd AutomatedFundraising/frontend
   python -m http.server 8000
   ```
   Then open: http://localhost:8000

2. **Using Node.js (npx):**
   ```bash
   cd AutomatedFundraising/frontend
   npx serve
   ```

3. **Using VS Code Live Server:**
   - Install "Live Server" extension
   - Right-click on `index.html`
   - Select "Open with Live Server"

### Option 2: Open Directly

Simply open `index.html` in your web browser. Some features may be limited without a server.

## 📊 Features

### Current Implementation

✅ **Dashboard Overview**
- Welcome card with total funds raised
- Monthly impact statistics
- Quick action buttons

✅ **Fundraising Trends Chart**
- Interactive line chart with Chart.js
- Time range filters (1M, 3M, 6M, 1Y, All)
- Goal line tracking
- Animated data visualization

✅ **Recent Donations Table**
- Donor information with avatars
- Campaign category badges
- Donation amounts and types
- "Send Thanks" action buttons

✅ **Impact Metrics**
- Monthly impact card
- Animals helped counter
- Progress sparkline

✅ **Updates & News**
- Latest success stories
- Event announcements
- Milestone celebrations

✅ **Mini Stats Cards**
- Active campaigns count
- Donor retention percentage
- Upcoming events

✅ **Navigation**
- Responsive sidebar
- Top navigation bar
- Search functionality
- User profile menu

### Responsive Design

- **Desktop (1440px+):** Full 3-column layout
- **Laptop (1024-1439px):** 2-column layout, sidebar icons only
- **Tablet (768-1023px):** 2-column, collapsible sidebar
- **Mobile (<768px):** Single column, slide-out sidebar

## 🎨 Design Tokens

All design tokens are defined in `css/variables.css`:

```css
/* Example tokens */
--accent-green: #10B981;
--bg-card: #0F0F0F;
--shadow-card: 0 20px 60px rgba(0,0,0,0.7)...;
--radius-card: 20px;
--font-primary: "Nunito", "Poppins", "Inter", sans-serif;
```

## 🔧 Customization

### Changing Colors

Edit `css/variables.css` to modify the color scheme:

```css
:root {
  --accent-green: #10B981;        /* Primary accent */
  --accent-green-light: #34D399;  /* Light variant */
  --accent-green-dark: #047857;   /* Dark variant */
}
```

### Adding New Components

1. Add HTML structure to `index.html`
2. Add component styles to `css/components.css`
3. Add interactivity to `js/main.js`

### Modifying Chart Data

Edit `js/chart.js` to customize the fundraising chart:

```javascript
function generateSampleData() {
  return {
    labels: ['Jan', 'Feb', 'Mar', ...],
    values: [12000, 18500, 22000, ...],
    goal: [23000, 23000, 23000, ...],
    donations: [45, 67, 82, ...]
  };
}
```

## 🔌 Integration with Backend

### API Endpoints (To Be Implemented)

The frontend expects these API endpoints:

```javascript
// Fundraising data
GET /api/fundraising/trends?range=6M
GET /api/fundraising/total

// Donations
GET /api/donations/recent?limit=10
POST /api/donations/create

// Campaigns
GET /api/campaigns/active
POST /api/campaigns/create

// Impact metrics
GET /api/impact/monthly
GET /api/impact/animals-helped
```

### Connecting to Python Backend

Example using Flask:

```python
from flask import Flask, send_from_directory

app = Flask(__name__, static_folder='frontend')

@app.route('/')
def serve_dashboard():
    return send_from_directory('frontend', 'index.html')

@app.route('/api/fundraising/trends')
def fundraising_trends():
    # Return JSON data
    return jsonify({
        'labels': ['Jan', 'Feb', 'Mar'],
        'values': [12000, 18500, 22000]
    })
```

## 🎭 Interactive Features

### Current Interactions

- **Search:** Real-time filtering (placeholder)
- **Notifications:** Click bell icon to view
- **Chart Controls:** Switch time ranges
- **Donation Table:** Hover effects and actions
- **Toast Notifications:** Success/confirmation messages
- **Responsive Sidebar:** Mobile-friendly navigation

### Planned Features

- [ ] Real-time donation notifications
- [ ] Advanced filtering and search
- [ ] Export reports to PDF
- [ ] Campaign creation wizard
- [ ] Donor management interface
- [ ] Email template editor
- [ ] Analytics deep-dive pages

## 🌐 Browser Support

- Chrome/Edge (latest)
- Firefox (latest)
- Safari (latest)
- Mobile browsers (iOS Safari, Chrome Mobile)

## 📦 Dependencies

### External Libraries

- **Chart.js 4.4.0** - Data visualization
  - Loaded via CDN in `index.html`
  - Used for fundraising trends chart

### Fonts

- **Google Fonts:**
  - Nunito (400, 500, 600, 700)
  - Inter (400, 500, 600, 700)

## 🐛 Known Issues

- Icons are currently Unicode emojis (consider replacing with icon library like Font Awesome or Lucide)
- Search functionality is placeholder only
- Chart data is sample/mock data
- No authentication/authorization yet

## 🚧 Next Steps

1. **Connect to Backend API**
   - Implement real data fetching
   - Add authentication
   - Handle loading states

2. **Add More Pages**
   - Campaign detail pages
   - Donor profiles
   - Analytics dashboard
   - Settings page

3. **Enhance Interactivity**
   - Modal dialogs for forms
   - Drag-and-drop for campaign creation
   - Real-time updates via WebSocket

4. **Performance Optimization**
   - Lazy loading for images
   - Code splitting
   - Service worker for offline support

## 📝 Development Notes

### Code Organization

- **CSS:** BEM-inspired naming convention
- **JavaScript:** Vanilla JS, no framework
- **Design Tokens:** CSS custom properties
- **Animations:** CSS animations + JavaScript triggers

### Testing

To test the dashboard:

1. Open `index.html` in a browser
2. Check responsive behavior (resize window)
3. Interact with buttons and controls
4. Verify chart time range switching
5. Test mobile sidebar toggle

## 📄 License

See the main project LICENSE file.

## 🙏 Acknowledgments

- Design system based on modern fintech/dashboard patterns
- Chart.js for beautiful data visualizations
- Inspired by compassionate, mission-driven design

---

**Built with 💚 for Funds 4 Furry Friends**

For design specifications, see: [docs/DESIGN_BRIEF.md](../docs/DESIGN_BRIEF.md)
For design tokens, see: [docs/design-tokens.json](../docs/design-tokens.json)
