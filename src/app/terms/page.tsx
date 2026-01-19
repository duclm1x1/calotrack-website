import { Navbar } from "@/components/shared/navbar";
import { Footer } from "@/components/shared/footer";
import { APP_NAME } from "@/lib/constants";

/**
 * Terms of Service Page
 * Required for production compliance
 */
export default function TermsPage() {
  return (
    <main className="min-h-screen bg-background">
      <Navbar />
      
      <div className="pt-24 pb-16 px-4">
        <div className="mx-auto max-w-3xl">
          <h1 className="text-3xl font-bold text-foreground mb-8">
            Điều Khoản Sử Dụng
          </h1>
          
          <div className="prose prose-invert max-w-none space-y-6">
            <p className="text-muted">
              Cập nhật lần cuối: Tháng 01/2026
            </p>
            
            <section>
              <h2 className="text-xl font-semibold text-foreground mb-3">
                1. Chấp Nhận Điều Khoản
              </h2>
              <p className="text-muted">
                Bằng việc sử dụng {APP_NAME}, bạn đồng ý tuân thủ các điều khoản này.
                Nếu không đồng ý, vui lòng không sử dụng dịch vụ.
              </p>
            </section>
            
            <section>
              <h2 className="text-xl font-semibold text-foreground mb-3">
                2. Mô Tả Dịch Vụ
              </h2>
              <p className="text-muted">
                {APP_NAME} cung cấp dịch vụ theo dõi dinh dưỡng và calo bằng AI thông qua 
                các nền tảng nhắn tin (Telegram, Zalo, Messenger). Kết quả phân tích 
                chỉ mang tính tham khảo và không thay thế tư vấn y tế chuyên nghiệp.
              </p>
            </section>
            
            <section>
              <h2 className="text-xl font-semibold text-foreground mb-3">
                3. Tài Khoản Người Dùng
              </h2>
              <ul className="list-disc list-inside text-muted space-y-2">
                <li>Bạn phải cung cấp thông tin chính xác khi đăng ký</li>
                <li>Bạn chịu trách nhiệm bảo mật tài khoản của mình</li>
                <li>Không được chia sẻ tài khoản cho người khác</li>
                <li>Phải từ 16 tuổi trở lên để sử dụng dịch vụ</li>
              </ul>
            </section>
            
            <section>
              <h2 className="text-xl font-semibold text-foreground mb-3">
                4. Thanh Toán & Hoàn Tiền
              </h2>
              <ul className="list-disc list-inside text-muted space-y-2">
                <li>Thanh toán được xử lý qua Stripe hoặc chuyển khoản ngân hàng</li>
                <li>Hoàn tiền 100% trong 7 ngày đầu nếu không hài lòng</li>
                <li>Sau 7 ngày, không hỗ trợ hoàn tiền cho các gói đã sử dụng</li>
                <li>Gói Lifetime không được hoàn tiền sau khi kích hoạt</li>
              </ul>
            </section>
            
            <section>
              <h2 className="text-xl font-semibold text-foreground mb-3">
                5. Nội Dung Bị Cấm
              </h2>
              <p className="text-muted">
                Bạn không được sử dụng dịch vụ để:
              </p>
              <ul className="list-disc list-inside text-muted space-y-2 mt-2">
                <li>Gửi nội dung bất hợp pháp, spam, hoặc quấy rối</li>
                <li>Cố gắng truy cập trái phép vào hệ thống</li>
                <li>Lạm dụng chương trình giới thiệu (affiliate)</li>
              </ul>
            </section>
            
            <section>
              <h2 className="text-xl font-semibold text-foreground mb-3">
                6. Giới Hạn Trách Nhiệm
              </h2>
              <p className="text-muted">
                {APP_NAME} không chịu trách nhiệm cho bất kỳ thiệt hại nào phát sinh từ 
                việc sử dụng dịch vụ, bao gồm nhưng không giới hạn: quyết định sức khỏe 
                dựa trên kết quả AI, mất dữ liệu, hoặc gián đoạn dịch vụ.
              </p>
            </section>
            
            <section>
              <h2 className="text-xl font-semibold text-foreground mb-3">
                7. Thay Đổi Điều Khoản
              </h2>
              <p className="text-muted">
                Chúng tôi có quyền cập nhật điều khoản này bất cứ lúc nào. 
                Người dùng sẽ được thông báo qua email về các thay đổi quan trọng.
              </p>
            </section>
            
            <section>
              <h2 className="text-xl font-semibold text-foreground mb-3">
                8. Liên Hệ
              </h2>
              <p className="text-muted">
                Thắc mắc về điều khoản, vui lòng liên hệ: 
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
