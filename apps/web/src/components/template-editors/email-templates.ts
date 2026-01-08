// Pre-built Unlayer email template designs

export interface EmailTemplatePreset {
  id: string;
  name: string;
  description: string;
  thumbnail: string;
  category: 'blank' | 'welcome' | 'newsletter' | 'promotional' | 'transactional';
  design: Record<string, unknown>;
}

// Blank template
const blankTemplate: EmailTemplatePreset = {
  id: 'blank',
  name: 'Blank',
  description: 'Start from scratch with a clean slate',
  thumbnail: '/templates/blank.png',
  category: 'blank',
  design: {
    counters: { u_row: 1, u_column: 1, u_content_text: 1 },
    body: {
      id: 'body',
      rows: [
        {
          id: 'row-1',
          cells: [1],
          columns: [
            {
              id: 'col-1',
              contents: [
                {
                  id: 'text-1',
                  type: 'text',
                  values: {
                    containerPadding: '20px',
                    anchor: '',
                    textAlign: 'center',
                    lineHeight: '140%',
                    linkStyle: {
                      inherit: true,
                      linkColor: '#0000ee',
                      linkHoverColor: '#0000ee',
                      linkUnderline: true,
                      linkHoverUnderline: true,
                    },
                    text: '<p style="font-size: 14px; line-height: 140%;">Start designing your email here...</p>',
                  },
                },
              ],
              values: {},
            },
          ],
          values: {
            backgroundColor: '',
            columnsBackgroundColor: '',
            backgroundImage: {
              url: '',
              fullWidth: true,
              repeat: false,
              center: true,
              cover: false,
            },
            padding: '0px',
            anchor: '',
            hideDesktop: false,
            hideMobile: false,
            noStackMobile: false,
          },
        },
      ],
      values: {
        popupPosition: 'center',
        popupWidth: '600px',
        popupHeight: 'auto',
        borderRadius: '10px',
        contentAlign: 'center',
        contentVerticalAlign: 'center',
        contentWidth: '600px',
        fontFamily: { label: 'Arial', value: 'arial,helvetica,sans-serif' },
        textColor: '#000000',
        popupBackgroundColor: '#FFFFFF',
        popupBackgroundImage: {
          url: '',
          fullWidth: true,
          repeat: false,
          center: true,
          cover: true,
        },
        popupOverlay_backgroundColor: 'rgba(0, 0, 0, 0.1)',
        popupCloseButton_position: 'top-right',
        popupCloseButton_backgroundColor: '#DDDDDD',
        popupCloseButton_iconColor: '#000000',
        popupCloseButton_borderRadius: '0px',
        popupCloseButton_margin: '0px',
        popupCloseButton_action: {
          name: 'close_popup',
          attrs: { onClick: "document.querySelector('.u-teleporter').remove();" },
        },
        backgroundColor: '#F5F5F5',
        backgroundImage: { url: '', fullWidth: true, repeat: false, center: true, cover: false },
        preheaderText: '',
        linkStyle: {
          body: true,
          linkColor: '#0068A5',
          linkHoverColor: '#0068A5',
          linkUnderline: true,
          linkHoverUnderline: true,
        },
      },
    },
  },
};

// Welcome Email template
const welcomeTemplate: EmailTemplatePreset = {
  id: 'welcome',
  name: 'Welcome Email',
  description: 'Greet new subscribers with a warm welcome',
  thumbnail: '/templates/welcome.png',
  category: 'welcome',
  design: {
    counters: { u_row: 4, u_column: 4, u_content_text: 4, u_content_image: 1, u_content_button: 1 },
    body: {
      id: 'body',
      rows: [
        // Header with logo
        {
          id: 'row-1',
          cells: [1],
          columns: [
            {
              id: 'col-1',
              contents: [
                {
                  id: 'text-1',
                  type: 'text',
                  values: {
                    containerPadding: '30px 20px 10px',
                    anchor: '',
                    textAlign: 'center',
                    lineHeight: '140%',
                    text: '<h1 style="font-size: 28px; line-height: 140%; font-weight: bold; color: #333333;">Welcome to {{company_name}}!</h1>',
                  },
                },
              ],
              values: {},
            },
          ],
          values: {
            backgroundColor: '#ffffff',
            padding: '0px',
          },
        },
        // Welcome message
        {
          id: 'row-2',
          cells: [1],
          columns: [
            {
              id: 'col-2',
              contents: [
                {
                  id: 'text-2',
                  type: 'text',
                  values: {
                    containerPadding: '20px 40px',
                    anchor: '',
                    textAlign: 'center',
                    lineHeight: '160%',
                    text: '<p style="font-size: 16px; line-height: 160%; color: #666666;">Hi {{first_name}},</p><p style="font-size: 16px; line-height: 160%; color: #666666;">&nbsp;</p><p style="font-size: 16px; line-height: 160%; color: #666666;">Thank you for joining us! We\'re excited to have you on board. Get ready to discover amazing features and exclusive content.</p>',
                  },
                },
              ],
              values: {},
            },
          ],
          values: {
            backgroundColor: '#ffffff',
            padding: '0px',
          },
        },
        // CTA Button
        {
          id: 'row-3',
          cells: [1],
          columns: [
            {
              id: 'col-3',
              contents: [
                {
                  id: 'button-1',
                  type: 'button',
                  values: {
                    containerPadding: '20px',
                    anchor: '',
                    href: {
                      name: 'web',
                      values: { href: 'https://example.com/get-started', target: '_blank' },
                    },
                    buttonColors: {
                      color: '#FFFFFF',
                      backgroundColor: '#3B82F6',
                      hoverColor: '#FFFFFF',
                      hoverBackgroundColor: '#2563EB',
                    },
                    size: { autoWidth: true, width: '100%' },
                    textAlign: 'center',
                    lineHeight: '120%',
                    padding: '15px 30px',
                    border: {},
                    borderRadius: '6px',
                    text: '<span style="font-size: 16px; line-height: 120%; font-weight: bold;">Get Started</span>',
                  },
                },
              ],
              values: {},
            },
          ],
          values: {
            backgroundColor: '#ffffff',
            padding: '0px 0px 30px',
          },
        },
        // Footer
        {
          id: 'row-4',
          cells: [1],
          columns: [
            {
              id: 'col-4',
              contents: [
                {
                  id: 'text-4',
                  type: 'text',
                  values: {
                    containerPadding: '20px',
                    anchor: '',
                    textAlign: 'center',
                    lineHeight: '140%',
                    text: '<p style="font-size: 12px; line-height: 140%; color: #999999;">© 2025 {{company_name}}. All rights reserved.</p><p style="font-size: 12px; line-height: 140%; color: #999999;"><a href="{{unsubscribe_url}}" style="color: #999999;">Unsubscribe</a></p>',
                  },
                },
              ],
              values: {},
            },
          ],
          values: {
            backgroundColor: '#f5f5f5',
            padding: '10px 0px',
          },
        },
      ],
      values: {
        contentWidth: '600px',
        contentAlign: 'center',
        fontFamily: { label: 'Arial', value: 'arial,helvetica,sans-serif' },
        textColor: '#000000',
        backgroundColor: '#F5F5F5',
        linkStyle: {
          body: true,
          linkColor: '#3B82F6',
          linkHoverColor: '#2563EB',
          linkUnderline: true,
          linkHoverUnderline: true,
        },
        preheaderText: "Welcome to {{company_name}}! We're glad you're here.",
      },
    },
  },
};

// Newsletter template
const newsletterTemplate: EmailTemplatePreset = {
  id: 'newsletter',
  name: 'Newsletter',
  description: 'Share updates and news with your audience',
  thumbnail: '/templates/newsletter.png',
  category: 'newsletter',
  design: {
    counters: { u_row: 5, u_column: 5, u_content_text: 6, u_content_divider: 2 },
    body: {
      id: 'body',
      rows: [
        // Header
        {
          id: 'row-1',
          cells: [1],
          columns: [
            {
              id: 'col-1',
              contents: [
                {
                  id: 'text-1',
                  type: 'text',
                  values: {
                    containerPadding: '30px 20px 20px',
                    textAlign: 'center',
                    lineHeight: '140%',
                    text: '<h1 style="font-size: 32px; line-height: 140%; font-weight: bold; color: #1a1a1a;">Monthly Newsletter</h1><p style="font-size: 14px; line-height: 140%; color: #666666; margin-top: 10px;">January 2025 Edition</p>',
                  },
                },
              ],
              values: {},
            },
          ],
          values: { backgroundColor: '#ffffff', padding: '0px' },
        },
        // Divider
        {
          id: 'row-2',
          cells: [1],
          columns: [
            {
              id: 'col-2',
              contents: [
                {
                  id: 'divider-1',
                  type: 'divider',
                  values: {
                    containerPadding: '10px 40px',
                    border: {
                      borderTopWidth: '1px',
                      borderTopStyle: 'solid',
                      borderTopColor: '#e0e0e0',
                    },
                    textAlign: 'center',
                    width: '100%',
                  },
                },
              ],
              values: {},
            },
          ],
          values: { backgroundColor: '#ffffff', padding: '0px' },
        },
        // Featured Article
        {
          id: 'row-3',
          cells: [1],
          columns: [
            {
              id: 'col-3',
              contents: [
                {
                  id: 'text-3',
                  type: 'text',
                  values: {
                    containerPadding: '20px 40px',
                    textAlign: 'left',
                    lineHeight: '160%',
                    text: '<h2 style="font-size: 22px; line-height: 140%; font-weight: bold; color: #333333;">Featured Story</h2><p style="font-size: 15px; line-height: 160%; color: #555555; margin-top: 15px;">Hi {{first_name}},</p><p style="font-size: 15px; line-height: 160%; color: #555555; margin-top: 10px;">Lorem ipsum dolor sit amet, consectetur adipiscing elit. Sed do eiusmod tempor incididunt ut labore et dolore magna aliqua. Ut enim ad minim veniam, quis nostrud exercitation.</p><p style="margin-top: 15px;"><a href="#" style="color: #3B82F6; font-weight: bold;">Read more →</a></p>',
                  },
                },
              ],
              values: {},
            },
          ],
          values: { backgroundColor: '#ffffff', padding: '0px' },
        },
        // Secondary Articles
        {
          id: 'row-4',
          cells: [1, 1],
          columns: [
            {
              id: 'col-4a',
              contents: [
                {
                  id: 'text-4',
                  type: 'text',
                  values: {
                    containerPadding: '20px',
                    textAlign: 'left',
                    lineHeight: '150%',
                    text: '<h3 style="font-size: 18px; font-weight: bold; color: #333333;">Quick Update</h3><p style="font-size: 14px; line-height: 150%; color: #666666; margin-top: 10px;">Brief description of the update or news item goes here.</p><p style="margin-top: 10px;"><a href="#" style="color: #3B82F6;">Learn more</a></p>',
                  },
                },
              ],
              values: {},
            },
            {
              id: 'col-4b',
              contents: [
                {
                  id: 'text-5',
                  type: 'text',
                  values: {
                    containerPadding: '20px',
                    textAlign: 'left',
                    lineHeight: '150%',
                    text: '<h3 style="font-size: 18px; font-weight: bold; color: #333333;">Tips & Tricks</h3><p style="font-size: 14px; line-height: 150%; color: #666666; margin-top: 10px;">Share useful tips with your subscribers here.</p><p style="margin-top: 10px;"><a href="#" style="color: #3B82F6;">Learn more</a></p>',
                  },
                },
              ],
              values: {},
            },
          ],
          values: { backgroundColor: '#f9f9f9', padding: '10px 20px' },
        },
        // Footer
        {
          id: 'row-5',
          cells: [1],
          columns: [
            {
              id: 'col-5',
              contents: [
                {
                  id: 'text-6',
                  type: 'text',
                  values: {
                    containerPadding: '30px 20px',
                    textAlign: 'center',
                    lineHeight: '140%',
                    text: '<p style="font-size: 12px; color: #999999;">You\'re receiving this because you subscribed to our newsletter.</p><p style="font-size: 12px; color: #999999; margin-top: 10px;"><a href="{{unsubscribe_url}}" style="color: #999999;">Unsubscribe</a> | <a href="{{web_version_url}}" style="color: #999999;">View in browser</a></p>',
                  },
                },
              ],
              values: {},
            },
          ],
          values: { backgroundColor: '#ffffff', padding: '0px' },
        },
      ],
      values: {
        contentWidth: '600px',
        contentAlign: 'center',
        fontFamily: { label: 'Arial', value: 'arial,helvetica,sans-serif' },
        textColor: '#000000',
        backgroundColor: '#e9e9e9',
        preheaderText: 'Your monthly update from {{company_name}}',
      },
    },
  },
};

// Promotional template
const promotionalTemplate: EmailTemplatePreset = {
  id: 'promotional',
  name: 'Promotional Sale',
  description: 'Announce sales, discounts, and special offers',
  thumbnail: '/templates/promotional.png',
  category: 'promotional',
  design: {
    counters: { u_row: 4, u_column: 4, u_content_text: 4, u_content_button: 1 },
    body: {
      id: 'body',
      rows: [
        // Hero section with discount
        {
          id: 'row-1',
          cells: [1],
          columns: [
            {
              id: 'col-1',
              contents: [
                {
                  id: 'text-1',
                  type: 'text',
                  values: {
                    containerPadding: '50px 20px 30px',
                    textAlign: 'center',
                    lineHeight: '120%',
                    text: '<p style="font-size: 16px; letter-spacing: 3px; color: #ffffff; text-transform: uppercase;">Limited Time Offer</p><h1 style="font-size: 72px; font-weight: bold; color: #ffffff; margin-top: 20px;">50% OFF</h1><p style="font-size: 20px; color: #ffffff; margin-top: 15px;">Use code: <strong>SAVE50</strong></p>',
                  },
                },
              ],
              values: {},
            },
          ],
          values: { backgroundColor: '#E11D48', padding: '0px' },
        },
        // Message
        {
          id: 'row-2',
          cells: [1],
          columns: [
            {
              id: 'col-2',
              contents: [
                {
                  id: 'text-2',
                  type: 'text',
                  values: {
                    containerPadding: '30px 40px 20px',
                    textAlign: 'center',
                    lineHeight: '160%',
                    text: '<h2 style="font-size: 24px; font-weight: bold; color: #333333;">Hey {{first_name}}, Don\'t Miss Out!</h2><p style="font-size: 16px; color: #666666; margin-top: 15px;">Our biggest sale of the year is here. Get incredible discounts on all products for a limited time only.</p>',
                  },
                },
              ],
              values: {},
            },
          ],
          values: { backgroundColor: '#ffffff', padding: '0px' },
        },
        // CTA
        {
          id: 'row-3',
          cells: [1],
          columns: [
            {
              id: 'col-3',
              contents: [
                {
                  id: 'button-1',
                  type: 'button',
                  values: {
                    containerPadding: '20px 20px 40px',
                    href: {
                      name: 'web',
                      values: { href: 'https://example.com/shop', target: '_blank' },
                    },
                    buttonColors: {
                      color: '#FFFFFF',
                      backgroundColor: '#E11D48',
                      hoverColor: '#FFFFFF',
                      hoverBackgroundColor: '#BE123C',
                    },
                    size: { autoWidth: true, width: '100%' },
                    textAlign: 'center',
                    lineHeight: '120%',
                    padding: '18px 40px',
                    border: {},
                    borderRadius: '8px',
                    text: '<span style="font-size: 18px; line-height: 120%; font-weight: bold;">SHOP NOW</span>',
                  },
                },
              ],
              values: {},
            },
          ],
          values: { backgroundColor: '#ffffff', padding: '0px' },
        },
        // Footer
        {
          id: 'row-4',
          cells: [1],
          columns: [
            {
              id: 'col-4',
              contents: [
                {
                  id: 'text-4',
                  type: 'text',
                  values: {
                    containerPadding: '20px',
                    textAlign: 'center',
                    lineHeight: '140%',
                    text: '<p style="font-size: 12px; color: #999999;">Offer valid until January 31, 2025. Terms and conditions apply.</p><p style="font-size: 12px; color: #999999; margin-top: 10px;"><a href="{{unsubscribe_url}}" style="color: #999999;">Unsubscribe</a></p>',
                  },
                },
              ],
              values: {},
            },
          ],
          values: { backgroundColor: '#f5f5f5', padding: '10px 0px' },
        },
      ],
      values: {
        contentWidth: '600px',
        contentAlign: 'center',
        fontFamily: { label: 'Arial', value: 'arial,helvetica,sans-serif' },
        textColor: '#000000',
        backgroundColor: '#f5f5f5',
        preheaderText: '50% OFF - Limited time offer! Use code SAVE50',
      },
    },
  },
};

// Password Reset template
const passwordResetTemplate: EmailTemplatePreset = {
  id: 'password-reset',
  name: 'Password Reset',
  description: 'Secure password reset email template',
  thumbnail: '/templates/password-reset.png',
  category: 'transactional',
  design: {
    counters: { u_row: 4, u_column: 4, u_content_text: 4, u_content_button: 1 },
    body: {
      id: 'body',
      rows: [
        // Header
        {
          id: 'row-1',
          cells: [1],
          columns: [
            {
              id: 'col-1',
              contents: [
                {
                  id: 'text-1',
                  type: 'text',
                  values: {
                    containerPadding: '40px 20px 20px',
                    textAlign: 'center',
                    lineHeight: '140%',
                    text: '<h1 style="font-size: 28px; font-weight: bold; color: #333333;">Reset Your Password</h1>',
                  },
                },
              ],
              values: {},
            },
          ],
          values: { backgroundColor: '#ffffff', padding: '0px' },
        },
        // Message
        {
          id: 'row-2',
          cells: [1],
          columns: [
            {
              id: 'col-2',
              contents: [
                {
                  id: 'text-2',
                  type: 'text',
                  values: {
                    containerPadding: '10px 40px 20px',
                    textAlign: 'center',
                    lineHeight: '160%',
                    text: '<p style="font-size: 16px; color: #666666;">Hi {{first_name}},</p><p style="font-size: 16px; color: #666666; margin-top: 15px;">We received a request to reset your password. Click the button below to create a new password. This link will expire in 24 hours.</p>',
                  },
                },
              ],
              values: {},
            },
          ],
          values: { backgroundColor: '#ffffff', padding: '0px' },
        },
        // Reset Button
        {
          id: 'row-3',
          cells: [1],
          columns: [
            {
              id: 'col-3',
              contents: [
                {
                  id: 'button-1',
                  type: 'button',
                  values: {
                    containerPadding: '20px 20px 30px',
                    href: { name: 'web', values: { href: '{{reset_link}}', target: '_blank' } },
                    buttonColors: {
                      color: '#FFFFFF',
                      backgroundColor: '#10B981',
                      hoverColor: '#FFFFFF',
                      hoverBackgroundColor: '#059669',
                    },
                    size: { autoWidth: true, width: '100%' },
                    textAlign: 'center',
                    lineHeight: '120%',
                    padding: '15px 35px',
                    border: {},
                    borderRadius: '6px',
                    text: '<span style="font-size: 16px; line-height: 120%; font-weight: bold;">Reset Password</span>',
                  },
                },
                {
                  id: 'text-3',
                  type: 'text',
                  values: {
                    containerPadding: '10px 40px 30px',
                    textAlign: 'center',
                    lineHeight: '150%',
                    text: '<p style="font-size: 14px; color: #999999;">If you didn\'t request a password reset, you can safely ignore this email. Your password will remain unchanged.</p>',
                  },
                },
              ],
              values: {},
            },
          ],
          values: { backgroundColor: '#ffffff', padding: '0px' },
        },
        // Footer
        {
          id: 'row-4',
          cells: [1],
          columns: [
            {
              id: 'col-4',
              contents: [
                {
                  id: 'text-4',
                  type: 'text',
                  values: {
                    containerPadding: '20px',
                    textAlign: 'center',
                    lineHeight: '140%',
                    text: '<p style="font-size: 12px; color: #999999;">This is an automated message from {{company_name}}.</p><p style="font-size: 12px; color: #999999; margin-top: 5px;">Please do not reply to this email.</p>',
                  },
                },
              ],
              values: {},
            },
          ],
          values: { backgroundColor: '#f5f5f5', padding: '10px 0px' },
        },
      ],
      values: {
        contentWidth: '600px',
        contentAlign: 'center',
        fontFamily: { label: 'Arial', value: 'arial,helvetica,sans-serif' },
        textColor: '#000000',
        backgroundColor: '#f5f5f5',
        preheaderText: 'Reset your password for {{company_name}}',
      },
    },
  },
};

// Order Confirmation template
const orderConfirmationTemplate: EmailTemplatePreset = {
  id: 'order-confirmation',
  name: 'Order Confirmation',
  description: 'Confirm orders and purchases',
  thumbnail: '/templates/order-confirmation.png',
  category: 'transactional',
  design: {
    counters: { u_row: 5, u_column: 5, u_content_text: 6, u_content_divider: 1 },
    body: {
      id: 'body',
      rows: [
        // Header
        {
          id: 'row-1',
          cells: [1],
          columns: [
            {
              id: 'col-1',
              contents: [
                {
                  id: 'text-1',
                  type: 'text',
                  values: {
                    containerPadding: '40px 20px 20px',
                    textAlign: 'center',
                    lineHeight: '140%',
                    text: '<p style="font-size: 48px; margin-bottom: 10px;">✓</p><h1 style="font-size: 28px; font-weight: bold; color: #10B981;">Order Confirmed!</h1>',
                  },
                },
              ],
              values: {},
            },
          ],
          values: { backgroundColor: '#ffffff', padding: '0px' },
        },
        // Order details
        {
          id: 'row-2',
          cells: [1],
          columns: [
            {
              id: 'col-2',
              contents: [
                {
                  id: 'text-2',
                  type: 'text',
                  values: {
                    containerPadding: '20px 40px',
                    textAlign: 'center',
                    lineHeight: '160%',
                    text: '<p style="font-size: 16px; color: #666666;">Hi {{first_name}},</p><p style="font-size: 16px; color: #666666; margin-top: 15px;">Thank you for your order! We\'re getting it ready to be shipped. We will notify you when it has been sent.</p>',
                  },
                },
              ],
              values: {},
            },
          ],
          values: { backgroundColor: '#ffffff', padding: '0px' },
        },
        // Order summary box
        {
          id: 'row-3',
          cells: [1],
          columns: [
            {
              id: 'col-3',
              contents: [
                {
                  id: 'text-3',
                  type: 'text',
                  values: {
                    containerPadding: '25px 30px',
                    textAlign: 'left',
                    lineHeight: '180%',
                    text: '<h3 style="font-size: 18px; font-weight: bold; color: #333333; margin-bottom: 15px;">Order Summary</h3><p style="font-size: 14px; color: #666666;"><strong>Order Number:</strong> #{{order_number}}</p><p style="font-size: 14px; color: #666666;"><strong>Order Date:</strong> {{order_date}}</p><p style="font-size: 14px; color: #666666;"><strong>Total:</strong> {{order_total}}</p>',
                  },
                },
              ],
              values: { backgroundColor: '#f9f9f9', borderRadius: '8px' },
            },
          ],
          values: { backgroundColor: '#ffffff', padding: '10px 30px 20px' },
        },
        // CTA
        {
          id: 'row-4',
          cells: [1],
          columns: [
            {
              id: 'col-4',
              contents: [
                {
                  id: 'text-5',
                  type: 'text',
                  values: {
                    containerPadding: '20px 40px 30px',
                    textAlign: 'center',
                    lineHeight: '150%',
                    text: '<p style="font-size: 14px; color: #666666;">Have questions about your order?</p><p style="margin-top: 10px;"><a href="#" style="color: #3B82F6; font-weight: bold;">Contact Support</a> | <a href="#" style="color: #3B82F6; font-weight: bold;">Track Order</a></p>',
                  },
                },
              ],
              values: {},
            },
          ],
          values: { backgroundColor: '#ffffff', padding: '0px' },
        },
        // Footer
        {
          id: 'row-5',
          cells: [1],
          columns: [
            {
              id: 'col-5',
              contents: [
                {
                  id: 'text-6',
                  type: 'text',
                  values: {
                    containerPadding: '20px',
                    textAlign: 'center',
                    lineHeight: '140%',
                    text: '<p style="font-size: 12px; color: #999999;">© 2025 {{company_name}}. All rights reserved.</p>',
                  },
                },
              ],
              values: {},
            },
          ],
          values: { backgroundColor: '#f5f5f5', padding: '10px 0px' },
        },
      ],
      values: {
        contentWidth: '600px',
        contentAlign: 'center',
        fontFamily: { label: 'Arial', value: 'arial,helvetica,sans-serif' },
        textColor: '#000000',
        backgroundColor: '#f5f5f5',
        preheaderText: 'Your order has been confirmed! Order #{{order_number}}',
      },
    },
  },
};

// Export all templates
export const emailTemplatePresets: EmailTemplatePreset[] = [
  blankTemplate,
  welcomeTemplate,
  newsletterTemplate,
  promotionalTemplate,
  passwordResetTemplate,
  orderConfirmationTemplate,
];

// Get template by ID
export function getEmailTemplateById(id: string): EmailTemplatePreset | undefined {
  return emailTemplatePresets.find((t) => t.id === id);
}
