import { Navbar } from "@/components/shared/navbar";
import { Footer } from "@/components/shared/footer";
import { APP_NAME } from "@/lib/constants";

/**
 * Privacy Policy Page
 * Required for production compliance
 */
export default function PrivacyPage() {
  return (
    <main className="min-h-screen bg-background">
      <Navbar />
      
      <div className="pt-24 pb-16 px-4">
        <div className="mx-auto max-w-3xl">
          <h1 className="text-3xl font-bold text-foreground mb-8">
            Chính Sách Bảo Mật
          </h1>
          
          <div className="prose prose-invert max-w-none space-y-6">
            <p className="text-muted">
              Cập nhật lần cuối: Tháng 01/2026
            </p>
            
            <section>
              <h2 className="text-xl font-semibold text-foreground mb-3">
                1. Thông Tin Thu Thập
              </h2>
              <p className="text-muted">
                {APP_NAME} thu thập các thông tin sau khi bạn sử dụng dịch vụ:
              </p>
              <ul className="list-disc list-inside text-muted space-y-2 mt-2">
                <li>Địa chỉ email và tên đăng ký</li>
                <li>ID Telegram/Zalo/Messenger để kết nối bot</li>
                <li>Hình ảnh đồ ăn bạn gửi để phân tích (xử lý tạm thời, không lưu trữ lâu dài)</li>
                <li>Dữ liệu dinh dưỡng và lịch sử log của bạn</li>
              </ul>
            </section>
            
            <section>
              <h2 className="text-xl font-semibold text-foreground mb-3">
                2. Cách Sử Dụng Thông Tin
              </h2>
              <p className="text-muted">
                Chúng tôi sử dụng thông tin của bạn để:
              </p>
              <ul className="list-disc list-inside text-muted space-y-2 mt-2">
                <li>Cung cấp dịch vụ theo dõi calo</li>
                <li>Gửi thông báo về streak và tiến độ</li>
                <li>Xử lý thanh toán và quản lý subscription</li>
                <li>Cải thiện chất lượng dịch vụ</li>
              </ul>
            </section>
            
            <section>
              <h2 className="text-xl font-semibold text-foreground mb-3">
                3. Bảo Mật Dữ Liệu
              </h2>
              <p className="text-muted">
                Chúng tôi cam kết bảo vệ dữ liệu của bạn bằng các biện pháp:
              </p>
              <ul className="list-disc list-inside text-muted space-y-2 mt-2">
                <li>Mã hóa SSL/TLS cho mọi kết nối</li>
                <li>Lưu trữ mật khẩu được hash an toàn</li>
                <li>Không chia sẻ dữ liệu với bên thứ 3 (trừ khi pháp luật yêu cầu)</li>
              </ul>
            </section>
            
            <section>
              <h2 className="text-xl font-semibold text-foreground mb-3">
                4. Quyền Của Bạn
              </h2>
              <p className="text-muted">
                Bạn có quyền yêu cầu xem, sửa đổi, hoặc xóa dữ liệu cá nhân của mình 
                bằng cách liên hệ với chúng tôi qua email hỗ trợ.
              </p>
            </section>
            
            <section>
              <h2 className="text-xl font-semibold text-foreground mb-3">
                5. Liên Hệ
              </h2>
              <p className="text-muted">
                Nếu có thắc mắc về chính sách bảo mật, vui lòng liên hệ: 
                <span className="text-primary"> support@calotrack.app</span>
              </p>
            </section>
          </div>
        </div>
      </div>
      
      <Footer />
    </main>
  );
}
