window.dataLayer = window.dataLayer || [];
function gtag(){ dataLayer.push(arguments); }

function getUTM() {
  var p = new URLSearchParams(window.location.search);
  return {
    utm_source:   p.get('utm_source')   || '',
    utm_medium:   p.get('utm_medium')   || '',
    utm_campaign: p.get('utm_campaign') || '',
    utm_keyword:  p.get('utm_keyword') || p.get('utm_term') || '',
    utm_content:  p.get('utm_content')  || ''
  };
}

function handleSubmit(e) {
  e.preventDefault();
  var btn   = document.querySelector('.btn-submit');
  var name  = document.getElementById('name').value.trim();
  var email = document.getElementById('email').value.trim();
  var phone = document.getElementById('phone').value.trim();
  var company = document.getElementById('company').value.trim();
  var currentEquipment = document.getElementById('currentEquipment').value;
  var sheetsPerDay = document.getElementById('sheetsPerDay').value;
  var decisionTimeline = document.getElementById('decisionTimeline').value;

  var emailValid = /^[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}$/.test(email);
  var phoneValid = /^[\+]?[\s.\-()]?[\d][\s.\-()\d]{8,}[\d]$/.test(phone.replace(/\s/g,''));

  if (!name || !company || !email || !phone) {
    alert('Please fill in your name, company, email, and phone.');
    return;
  }
  if (!emailValid) {
    alert('Please enter a valid email address.');
    return;
  }
  if (!phoneValid) {
    alert('Please enter a valid phone number.');
    return;
  }

  btn.textContent = 'Sending…';
  btn.disabled = true;

  var payload = Object.assign({
    formType: 'hot-lead',
    name: name, email: email, phone: phone, company: company,
    currentEquipment: currentEquipment,
    sheetsPerDay: sheetsPerDay,
    decisionTimeline: decisionTimeline,
    page: window.location.href,
    timestamp: new Date().toISOString()
  }, getUTM());

  fetch('/api/submit-lead', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  })
  .then(function(res) {
    if (!res.ok) throw new Error('Server error');
    document.getElementById('form-wrap').style.display = 'none';
    document.getElementById('form-success').style.display = 'block';

    if (typeof gtag !== 'undefined') {
      gtag('event', 'conversion', {
        send_to: 'AW-18165996338/zQYoCJ_yyq4cELK2nNZD',
        value: 1.0,
        currency: 'USD'
      });
      gtag('event', 'generate_lead', {
        event_category: 'form',
        event_label: 'demo_request'
      });
    }
  })
  .catch(function() {
    btn.textContent = 'Request a Demo →';
    btn.disabled = false;
    alert('Something went wrong. Please try again or call us directly.');
  });
}
