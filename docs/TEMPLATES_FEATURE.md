# Templates Feature Documentation

## Overview

The Templates feature provides a comprehensive system for creating, managing, and using message templates across multiple channels: **Email**, **SMS**, and **WhatsApp**. This feature supports the marketing automation platform by enabling users to create reusable, personalized message templates with variable substitution.

---

## Table of Contents

1. [Feature Summary](#feature-summary)
2. [Folder Structure](#folder-structure)
3. [Database Schema](#database-schema)
4. [API Endpoints](#api-endpoints)
5. [Frontend Components](#frontend-components)
6. [User Flows](#user-flows)
7. [Libraries & Dependencies](#libraries--dependencies)
8. [Configuration](#configuration)

---

## Feature Summary

### Supported Template Types

| Type         | Description                 | Editor                | Features                                                         |
| ------------ | --------------------------- | --------------------- | ---------------------------------------------------------------- |
| **Email**    | HTML email templates        | Unlayer Drag-and-Drop | Pre-built templates, thumbnail generation, design JSON storage   |
| **SMS**      | Text message templates      | Plain text editor     | Character counting, GSM-7/Unicode detection, segment calculation |
| **WhatsApp** | WhatsApp Business templates | Structured editor     | Category, language, header, body, footer, buttons, emoji picker  |

### Key Capabilities

- Multi-tenant architecture with Row Level Security
- Template categories for organization
- Variable extraction and substitution (`{{variable_name}}`)
- Template duplication
- Preview with sample data
- Thumbnail generation for email templates
- Soft delete support

---

## Folder Structure

### Backend (NestJS)

```
apps/api/src/modules/templates/
├── dto/
│   ├── index.ts                        # DTO exports
│   ├── create-template.dto.ts          # Template creation validation
│   ├── update-template.dto.ts          # Template update validation
│   ├── filter-templates.dto.ts         # Query/filter parameters
│   ├── create-template-category.dto.ts # Category creation
│   └── update-template-category.dto.ts # Category update
├── entities/
│   ├── index.ts                        # Entity exports
│   ├── template.entity.ts              # Template entity definition
│   └── template-category.entity.ts     # Category entity definition
├── templates.module.ts                 # NestJS module definition
├── templates.service.ts                # Business logic
└── templates.controller.ts             # REST API endpoints
```

### Frontend (Next.js)

```
apps/web/src/
├── app/(dashboard)/templates/
│   ├── page.tsx                        # Template listing page
│   ├── new/
│   │   └── page.tsx                    # Create new template page
│   └── [id]/
│       └── page.tsx                    # Edit template page
├── components/template-editors/
│   ├── index.ts                        # Component exports
│   ├── email-editor.tsx                # Unlayer email editor wrapper
│   ├── email-templates.ts              # Pre-built email template designs
│   ├── template-picker.tsx             # Template selection dialog
│   ├── sms-editor.tsx                  # SMS text editor
│   └── whatsapp-editor.tsx             # WhatsApp structured editor
└── lib/api/
    └── templates.ts                    # API client functions
```

### Static Files

```
uploads/
└── thumbnails/                         # Email template thumbnails
    └── {templateId}-{uuid}.png
```

---

## Database Schema

### Templates Table (`templates`)

| Column          | Type         | Nullable | Description                       |
| --------------- | ------------ | -------- | --------------------------------- |
| `id`            | UUID         | No       | Primary key                       |
| `tenant_id`     | UUID         | No       | Tenant reference (RLS)            |
| `name`          | VARCHAR(255) | No       | Template name                     |
| `type`          | ENUM         | No       | `email`, `sms`, `whatsapp`        |
| `category_id`   | UUID         | Yes      | Category reference                |
| `subject`       | VARCHAR(255) | Yes      | Email subject line                |
| `content`       | TEXT         | Yes      | Template content (HTML/text/JSON) |
| `design_json`   | JSONB        | Yes      | Unlayer design JSON (email only)  |
| `plain_text`    | TEXT         | Yes      | Plain text version                |
| `variables`     | JSONB        | No       | Extracted variables array         |
| `thumbnail_url` | VARCHAR(500) | Yes      | Thumbnail image path              |
| `status`        | ENUM         | No       | `draft`, `active`, `archived`     |
| `is_active`     | BOOLEAN      | No       | Active flag (default: true)       |
| `metadata`      | JSONB        | No       | Additional metadata               |
| `created_at`    | TIMESTAMP    | No       | Creation timestamp                |
| `updated_at`    | TIMESTAMP    | No       | Last update timestamp             |
| `deleted_at`    | TIMESTAMP    | Yes      | Soft delete timestamp             |

**Indexes:**

- `(tenant_id, type)`
- `(tenant_id, status)`
- `(tenant_id, category_id)`
- `(tenant_id, name)`
- `(tenant_id, created_at)`

### Template Categories Table (`template_categories`)

| Column        | Type         | Nullable | Description                  |
| ------------- | ------------ | -------- | ---------------------------- |
| `id`          | UUID         | No       | Primary key                  |
| `tenant_id`   | UUID         | No       | Tenant reference (RLS)       |
| `name`        | VARCHAR(100) | No       | Category name                |
| `description` | TEXT         | Yes      | Category description         |
| `color`       | VARCHAR(7)   | No       | Hex color (default: #6366f1) |
| `icon`        | VARCHAR(50)  | No       | Icon name (default: folder)  |
| `sort_order`  | INTEGER      | No       | Display order (default: 0)   |
| `created_at`  | TIMESTAMP    | No       | Creation timestamp           |
| `updated_at`  | TIMESTAMP    | No       | Last update timestamp        |

**Indexes:**

- `(tenant_id, name)` - UNIQUE
- `(tenant_id, sort_order)`

### Entity Relationships

```
┌─────────────────┐       ┌─────────────────────┐
│     Tenant      │       │  TemplateCategory   │
│─────────────────│       │─────────────────────│
│ id              │◄──────│ tenant_id           │
│ name            │       │ id                  │
│ ...             │       │ name                │
└─────────────────┘       │ color               │
        ▲                 │ icon                │
        │                 └─────────────────────┘
        │                          ▲
        │                          │ (optional)
        │                          │
┌───────┴─────────┐       ┌────────┴────────────┐
│    Template     │───────│                     │
│─────────────────│       │                     │
│ tenant_id       │       │                     │
│ category_id     │───────┘                     │
│ type            │                             │
│ content         │                             │
│ design_json     │                             │
│ variables       │                             │
└─────────────────┘
```

---

## API Endpoints

### Base URL: `/api/v1/templates`

### Templates

| Method   | Endpoint            | Description                             |
| -------- | ------------------- | --------------------------------------- |
| `POST`   | `/`                 | Create a new template                   |
| `GET`    | `/`                 | Get all templates (paginated, filtered) |
| `GET`    | `/stats`            | Get template statistics                 |
| `GET`    | `/:id`              | Get template by ID                      |
| `PUT`    | `/:id`              | Update template                         |
| `DELETE` | `/:id`              | Delete template (soft delete)           |
| `POST`   | `/:id/duplicate`    | Duplicate template                      |
| `POST`   | `/:id/preview`      | Preview template with sample data       |
| `POST`   | `/upload-thumbnail` | Upload template thumbnail               |

### Categories

| Method   | Endpoint          | Description        |
| -------- | ----------------- | ------------------ |
| `POST`   | `/categories`     | Create category    |
| `GET`    | `/categories`     | Get all categories |
| `GET`    | `/categories/:id` | Get category by ID |
| `PUT`    | `/categories/:id` | Update category    |
| `DELETE` | `/categories/:id` | Delete category    |

### Request/Response Examples

#### Create Template

```http
POST /api/v1/templates
Content-Type: application/json
Authorization: Bearer <token>

{
  "name": "Welcome Email",
  "type": "email",
  "subject": "Welcome to {{company_name}}!",
  "content": "<h1>Hello {{first_name}}</h1>",
  "designJson": { ... },
  "categoryId": "uuid",
  "status": "draft"
}
```

#### Filter Templates

```http
GET /api/v1/templates?type=email&status=active&page=1&limit=20&search=welcome
```

#### Response (Paginated)

```json
{
  "data": [
    {
      "id": "uuid",
      "name": "Welcome Email",
      "type": "email",
      "status": "active",
      "variables": ["company_name", "first_name"],
      "thumbnailUrl": "/uploads/thumbnails/uuid.png",
      "createdAt": "2024-01-15T10:00:00Z",
      "category": {
        "id": "uuid",
        "name": "Onboarding",
        "color": "#6366f1"
      }
    }
  ],
  "meta": {
    "total": 50,
    "page": 1,
    "limit": 20,
    "totalPages": 3,
    "hasNextPage": true,
    "hasPrevPage": false
  }
}
```

---

## Frontend Components

### Template Editors

#### 1. Email Editor (`email-editor.tsx`)

- **Library**: `react-email-editor` (Unlayer)
- **Features**:
  - Drag-and-drop email builder
  - Merge tags for variables
  - Export HTML and design JSON
  - Thumbnail generation via `html2canvas`

```typescript
interface EmailEditorRef {
  exportHtml: () => Promise<{ html: string; design: Record<string, unknown> }>;
  exportImage: () => Promise<{ url: string }>;
  loadDesign: (design: Record<string, unknown>) => void;
}
```

#### 2. SMS Editor (`sms-editor.tsx`)

- **Features**:
  - Plain text editor
  - Character count (GSM-7: 160 chars, Unicode: 70 chars)
  - Segment calculation
  - Variable insertion buttons
  - Live phone preview

```typescript
interface SmsEditorProps {
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  maxLength?: number;
}
```

#### 3. WhatsApp Editor (`whatsapp-editor.tsx`)

- **Features**:
  - Template category selection (MARKETING, UTILITY, AUTHENTICATION)
  - Language selection (71 languages, searchable)
  - Header support (text, image, video, document)
  - Body with 1024 char limit
  - Footer with 60 char limit
  - Buttons (Quick Reply, URL, Phone) - max 3
  - Emoji picker (`emoji-picker-react`)
  - Live iPhone mockup preview (`react-device-frameset`)

```typescript
interface WhatsAppTemplate {
  category?: 'MARKETING' | 'UTILITY' | 'AUTHENTICATION';
  language?: string;
  header?: {
    type: 'text' | 'image' | 'video' | 'document';
    content: string;
  };
  body: string;
  footer?: string;
  buttons?: WhatsAppButton[];
}
```

### Pre-built Email Templates

Located in `email-templates.ts`, includes 8 pre-built designs:

1. Blank Canvas
2. Simple Newsletter
3. Promotional Sale
4. Welcome Email
5. Order Confirmation
6. Event Invitation
7. Product Launch
8. Feedback Request

### Template Picker (`template-picker.tsx`)

Dialog component for selecting pre-built email templates.

---

## User Flows

### 1. Create New Template

```
┌─────────────────────────────────────────────────────────────────┐
│                      CREATE TEMPLATE FLOW                       │
└─────────────────────────────────────────────────────────────────┘

    ┌──────────────┐      ┌──────────────┐      ┌──────────────┐
    │   /templates │ ───► │ Click "New   │ ───► │ Select Type  │
    │   (List)     │      │  Template"   │      │ Email/SMS/WA │
    └──────────────┘      └──────────────┘      └──────────────┘
                                                       │
                          ┌────────────────────────────┼────────────────────────────┐
                          │                            │                            │
                          ▼                            ▼                            ▼
                   ┌──────────────┐           ┌──────────────┐           ┌──────────────┐
                   │    EMAIL     │           │     SMS      │           │   WHATSAPP   │
                   │──────────────│           │──────────────│           │──────────────│
                   │ 1. Enter name│           │ 1. Enter name│           │ 1. Enter name│
                   │ 2. Pick      │           │ 2. Write msg │           │ 2. Select    │
                   │    preset    │           │ 3. Add vars  │           │    category  │
                   │    (optional)│           │              │           │ 3. Select    │
                   │ 3. Design    │           │              │           │    language  │
                   │    email     │           │              │           │ 4. Add header│
                   │ 4. Set       │           │              │           │ 5. Write body│
                   │    subject   │           │              │           │ 6. Add footer│
                   │              │           │              │           │ 7. Add buttons│
                   └──────────────┘           └──────────────┘           └──────────────┘
                          │                            │                            │
                          └────────────────────────────┼────────────────────────────┘
                                                       │
                                                       ▼
                                              ┌──────────────┐
                                              │    Click     │
                                              │   "Create"   │
                                              └──────────────┘
                                                       │
                                                       ▼
                                              ┌──────────────┐
                                              │  Redirect to │
                                              │  Edit Page   │
                                              └──────────────┘
```

### 2. Edit Template

```
┌─────────────────────────────────────────────────────────────────┐
│                       EDIT TEMPLATE FLOW                        │
└─────────────────────────────────────────────────────────────────┘

    ┌──────────────┐      ┌──────────────┐      ┌──────────────┐
    │  /templates  │ ───► │ Click on     │ ───► │ /templates/  │
    │  (List)      │      │ template     │      │ [id]         │
    └──────────────┘      └──────────────┘      └──────────────┘
                                                       │
                                                       ▼
                                              ┌──────────────┐
                                              │ Load Design  │
                                              │ from API     │
                                              │ (designJson) │
                                              └──────────────┘
                                                       │
                          ┌────────────────────────────┼────────────────────────────┐
                          │                            │                            │
                          ▼                            ▼                            ▼
                   ┌──────────────┐           ┌──────────────┐           ┌──────────────┐
                   │    EMAIL     │           │     SMS      │           │   WHATSAPP   │
                   │──────────────│           │──────────────│           │──────────────│
                   │ - Edit in    │           │ - Edit text  │           │ - Edit all   │
                   │   Unlayer    │           │ - Preview    │           │   sections   │
                   │ - Change     │           │   updates    │           │ - Preview    │
                   │   templates  │           │   live       │           │   in iPhone  │
                   │ - Settings   │           │              │           │   mockup     │
                   └──────────────┘           └──────────────┘           └──────────────┘
                          │                            │                            │
                          └────────────────────────────┼────────────────────────────┘
                                                       │
                                                       ▼
                                              ┌──────────────┐
                                              │ Click "Save" │
                                              └──────────────┘
                                                       │
                                    ┌──────────────────┴──────────────────┐
                                    │                                     │
                                    ▼                                     ▼
                           ┌──────────────┐                      ┌──────────────┐
                           │ Export HTML  │                      │ Save to API  │
                           │ & Design     │                      │ PUT /templates│
                           │ (Email only) │                      │ /:id         │
                           └──────────────┘                      └──────────────┘
                                    │
                                    ▼
                           ┌──────────────┐
                           │ Generate &   │
                           │ Upload       │
                           │ Thumbnail    │
                           └──────────────┘
```

### 3. Template List View

```
┌─────────────────────────────────────────────────────────────────┐
│                      TEMPLATE LIST PAGE                         │
└─────────────────────────────────────────────────────────────────┘

    ┌─────────────────────────────────────────────────────────┐
    │  FILTERS                              [+ New Template]  │
    │  ┌────────┐ ┌────────┐ ┌────────┐ ┌────────────────┐   │
    │  │All     ▼│ │Status ▼│ │Category│ │ Search...      │   │
    │  │Email   │ │Draft   │ │        │ │                │   │
    │  │SMS     │ │Active  │ │        │ │                │   │
    │  │WhatsApp│ │Archived│ │        │ │                │   │
    │  └────────┘ └────────┘ └────────┘ └────────────────┘   │
    └─────────────────────────────────────────────────────────┘

    ┌─────────────────────────────────────────────────────────┐
    │  TEMPLATE CARDS (Grid View)                             │
    │                                                         │
    │  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐     │
    │  │ [Thumbnail] │  │ [Thumbnail] │  │ [SMS        │     │
    │  │             │  │             │  │  Preview]   │     │
    │  │─────────────│  │─────────────│  │─────────────│     │
    │  │ Welcome     │  │ Newsletter  │  │ Order       │     │
    │  │ Email       │  │ Template    │  │ Confirm     │     │
    │  │ ───────     │  │ ───────     │  │ ───────     │     │
    │  │ 📧 Email    │  │ 📧 Email    │  │ 📱 SMS      │     │
    │  │ ● Active    │  │ ● Draft     │  │ ● Active    │     │
    │  └─────────────┘  └─────────────┘  └─────────────┘     │
    │                                                         │
    │  ┌─────────────┐  ┌─────────────┐                      │
    │  │ [WhatsApp   │  │ [Thumbnail] │                      │
    │  │  Preview]   │  │             │                      │
    │  │─────────────│  │─────────────│                      │
    │  │ Support     │  │ Promo Sale  │                      │
    │  │ Message     │  │             │                      │
    │  │ ───────     │  │ ───────     │                      │
    │  │ 💬 WhatsApp │  │ 📧 Email    │                      │
    │  │ ● Active    │  │ ● Archived  │                      │
    │  └─────────────┘  └─────────────┘                      │
    └─────────────────────────────────────────────────────────┘
```

---

## Libraries & Dependencies

### Backend

| Package             | Version | Purpose            |
| ------------------- | ------- | ------------------ |
| `@nestjs/common`    | ^10.x   | NestJS framework   |
| `@nestjs/typeorm`   | ^10.x   | Database ORM       |
| `class-validator`   | ^0.14.x | DTO validation     |
| `class-transformer` | ^0.5.x  | DTO transformation |
| `uuid`              | ^9.x    | UUID generation    |

### Frontend

| Package                 | Version | Purpose                 |
| ----------------------- | ------- | ----------------------- |
| `react-email-editor`    | ^1.7.x  | Unlayer email editor    |
| `emoji-picker-react`    | ^4.x    | Emoji picker component  |
| `react-device-frameset` | ^1.3.x  | Phone mockup frames     |
| `html2canvas`           | ^1.4.x  | Thumbnail generation    |
| `@tanstack/react-query` | ^5.x    | Server state management |
| `sonner`                | ^1.x    | Toast notifications     |

### Pre-built Components (shadcn/ui)

- `Button`, `Input`, `Textarea`, `Label`
- `Select`, `SelectContent`, `SelectItem`
- `Command`, `CommandInput`, `CommandList` (Combobox)
- `Popover`, `PopoverContent`, `PopoverTrigger`
- `Dialog`, `DialogContent`, `DialogHeader`
- `Badge`, `Skeleton`, `Sheet`

---

## Configuration

### Environment Variables

```env
# Backend (apps/api/.env)
DATABASE_URL=postgresql://user:pass@localhost:5432/marketing
FRONTEND_URL=http://localhost:3001

# Frontend (apps/web/.env)
NEXT_PUBLIC_API_URL=http://localhost:3000
```

### Static File Serving

Thumbnails are served from `/uploads/thumbnails/` with CORS headers:

```typescript
// apps/api/src/main.ts
app.use(
  '/uploads',
  (req, res, next) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
    next();
  },
  express.static(path.join(process.cwd(), 'uploads'))
);
```

### Swagger API Documentation

Available at: `http://localhost:3000/docs`

Templates endpoints are tagged under "Templates" in Swagger UI.

---

## Template Variables

Variables use the format `{{variable_name}}` and are automatically extracted from content.

### Available Variables

| Variable              | Description          | Example          |
| --------------------- | -------------------- | ---------------- |
| `{{first_name}}`      | Contact's first name | John             |
| `{{last_name}}`       | Contact's last name  | Doe              |
| `{{email}}`           | Contact's email      | john@example.com |
| `{{phone}}`           | Contact's phone      | +1234567890      |
| `{{company}}`         | Contact's company    | Acme Inc         |
| `{{unsubscribe_url}}` | Unsubscribe link     | https://...      |
| `{{web_version_url}}` | View in browser link | https://...      |

### WhatsApp Variables

WhatsApp uses positional variables: `{{1}}`, `{{2}}`, `{{3}}`, etc.

---

## Security Considerations

1. **Multi-tenancy**: All queries filter by `tenant_id`
2. **Soft Delete**: Templates are soft-deleted (recoverable)
3. **Input Validation**: All DTOs use class-validator
4. **File Upload**: Only PNG/JPEG allowed, validated server-side
5. **CORS**: Configured for frontend origin only

---

## Future Enhancements

- [ ] Template versioning
- [ ] Template sharing between users
- [ ] Pre-built SMS/WhatsApp templates
- [ ] Template analytics (usage tracking)
- [ ] A/B testing support
- [ ] Template approval workflow
- [ ] Import/Export templates

---

## Related Documentation

- [Contacts Feature](./CONTACTS_FEATURE.md)
- [Campaigns Feature](./CAMPAIGNS_FEATURE.md)
- [API Documentation](http://localhost:3000/docs)
