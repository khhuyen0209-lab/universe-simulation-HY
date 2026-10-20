// client/src/components/OrientationGuard.js
// Bắt buộc điện thoại ở chế độ ngang (landscape). Desktop không bị ảnh hưởng.
//
// Logic:
//   - "Điện thoại" = thiết bị cảm ứng (pointer: coarse) với màn hình nhỏ.
//   - Nếu điện thoại đang ở portrait (cao > rộng) -> hiện màn hình yêu cầu xoay.
//   - Thử khóa landscape bằng Screen Orientation API (nếu trình duyệt cho phép).
//     Nếu không hỗ trợ / bị từ chối -> hướng dẫn người dùng tự xoay. KHÔNG báo khóa thành công giả.
//   - Lắng nghe orientationchange, resize, visibilitychange để tự động ẩn/hiện.
//   - Khi đã landscape -> ẩn guard ngay; khi quay lại portrait -> hiện lại ngay.

export default class OrientationGuard {
  constructor() {
    this.el = document.getElementById('orientation-guard');
    this.btn = document.getElementById('btn-request-landscape');
    this.isPhone = this._detectPhone();
    this.active = false; // guard có đang hiển thị không

    this._onChange = this._onChange.bind(this);
    window.addEventListener('resize', this._onChange);
    window.addEventListener('orientationchange', this._onChange);
    document.addEventListener('visibilitychange', () => { if (!document.hidden) this._onChange(); });

    if (this.btn) {
      this.btn.addEventListener('click', () => this._requestLandscape());
    }
    this._onChange();
  }

  _detectPhone() {
    const coarse = window.matchMedia && window.matchMedia('(pointer: coarse)').matches;
    const small = Math.min(window.screen.width, window.screen.height) < 768;
    return coarse && small;
  }

  isPortrait() {
    return window.innerHeight > window.innerWidth;
  }

  _onChange() {
    if (!this.isPhone) {
      this._hide();
      return;
    }
    if (this.isPortrait()) this._show();
    else this._hide();
  }

  _show() {
    if (this.active) return;
    this.active = true;
    this.el.hidden = false;
    // Tạm dừng render? Không — vẫn render phía sau, nhưng guard che hết.
    document.body.classList.add('orientation-locked');
  }

  _hide() {
    if (!this.active && this.el.hidden) return;
    this.active = false;
    this.el.hidden = true;
    document.body.classList.remove('orientation-locked');
    // Gửi sự kiện để app resize canvas (tránh kẹt kích thước sai).
    window.dispatchEvent(new Event('orientationguard:resume'));
  }

  async _requestLandscape() {
    // Chỉ thử khi API hỗ trợ. Không bao giờ tuyên bố thành công nếu không chắc.
    const so = screen.orientation || screen.mozOrientation || screen.msOrientation;
    if (so && typeof so.lock === 'function') {
      try {
        await so.lock('landscape');
        // Thành công thật — trình duyệt đã xoay. _onChange sẽ tự ẩn guard.
        setTimeout(() => this._onChange(), 300);
        return;
      } catch (err) {
        // Bị từ chối / không được phép -> giữ hướng dẫn tự xoay.
        console.info('Screen Orientation lock bi tu choi:', err.message);
      }
    }
    // Không hỗ trợ hoặc bị từ chối: hướng dẫn rõ ràng.
    const hint = this.el.querySelector('.orientation-hint');
    if (hint) {
      hint.textContent = 'Trình duyệt không cho phép tự động xoay. Vui lòng tự xoay điện thoại sang ngang và bật tự động xoay màn hình.';
      hint.style.color = '#ffb4b4';
    }
  }

  // Cho phép các thành phần khác hỏi xem guard có đang chặn không.
  isBlocking() { return this.active; }
}
