module.exports = {
  // Tax integrations test configuration
  tax_integrations: [
    {
      tax_integration: {
        code: 'tax-integration-1',
        title: 'My tax integration enabled',
        active: true,
        stores: [
          'default'
        ]
      }
    },
    {
      tax_integration: {
        code: 'tax-integration-2',
        title: 'My tax integration disabled',
        active: false,
        stores: [
          'default'
        ]
      }
    }
  ],

  // Payment methods test configuration
  methods: [
    {
      payment_method: {
        code: 'method-1',
        title: 'Method one',
        active: true,
        backend_integration_url: 'http://oope-payment-method.pay/event',
        stores: [
          'default'
        ],
        order_status: 'complete',
        countries: [
          'ES',
          'US'
        ],
        currencies: [
          'EUR',
          'USD'
        ],
        custom_config: [
          {
            key: 'foo',
            value: 'bar'
          }
        ]
      }
    },
    {
      payment_method: {
        code: 'method-2',
        title: 'Method Two',
        active: true,
        backend_integration_url: 'http://oope-payment-method.pay/event',
        stores: [
          'default'
        ],
        order_status: 'complete',
        countries: [
          'ES',
          'US'
        ],
        currencies: [
          'EUR',
          'USD'
        ],
        custom_config: [
          {
            key: 'foo',
            value: 'bar'
          }
        ]
      }
    }
  ],

  // Shipping carriers test configuration
  shipping_carriers: [
    {
      carrier: {
        code: 'carrier-1',
        title: 'Carrier one',
        stores: [
          'default'
        ],
        countries: [
          'US',
          'CA'
        ],
        sort_order: 10,
        active: true,
        tracking_available: true,
        shipping_labels_available: true
      }
    },
    {
      carrier: {
        code: 'carrier-2',
        title: 'Carrier two',
        stores: [
          'default'
        ],
        countries: [
          'US'
        ],
        sort_order: 50,
        active: true,
        tracking_available: false,
        shipping_labels_available: true
      }
    }
  ]
};
