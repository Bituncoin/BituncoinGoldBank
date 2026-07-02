// ╔══════════════════════════════════════════════════════════════════╗
// ║  BTNG iOS SDK — UBL-1.0                                         ║
// ║  Swift · URLSession · Drop into any iOS banking app            ║
// ╚══════════════════════════════════════════════════════════════════╝
//
// USAGE (Swift Package / drag BTNGClient.swift into Xcode):
//   let btng = BTNGClient(baseUrl: "https://btng-bank.yourdomain.com")
//   btng.getWallet(btngId: "BTNG-1234-5678") { json in
//       DispatchQueue.main.async { /* update UI */ }
//   }

import Foundation

// MARK: - Constants
private let UBL_VERSION   = "UBL-1.0"
private let CLIENT_TAG    = "ios-native"
private let GOLD_SYMBOL   = "BTNGG"
private let CHAIN_PREFIX  = "btng1"
private let BASE_RATE_APR = 0.08
private let MAX_LTV       = 0.70

// MARK: - Client
class BTNGClient {

    let baseUrl: String
    let session = URLSession.shared

    init(baseUrl: String) {
        self.baseUrl = baseUrl.hasSuffix("/")
            ? String(baseUrl.dropLast())
            : baseUrl
    }

    // MARK: Wallet Lookup
    func getWallet(
        btngId: String,
        completion: @escaping ([String: Any]?) -> Void
    ) {
        guard let url = URL(string: "\(baseUrl)/wallet/\(btngId)") else {
            completion(nil); return
        }
        var req = URLRequest(url: url)
        addHeaders(&req)
        session.dataTask(with: req) { data, _, _ in
            completion(self.parseJson(data))
        }.resume()
    }

    // MARK: Loan Quote
    func loanQuote(
        btngId:     String,
        principal:  Double,
        days:       Int,
        completion: @escaping ([String: Any]?) -> Void
    ) {
        let payload: [String: Any] = [
            "btng_id":   btngId,
            "principal": principal,
            "days":      days
        ]
        post(path: "/loan/quote", payload: payload, completion: completion)
    }

    // MARK: Card Activation
    func activateCard(
        btngId:     String,
        wallet:     String,
        expires:    String? = nil,
        completion: @escaping ([String: Any]?) -> Void
    ) {
        var payload: [String: Any] = [
            "btng_id": btngId,
            "wallet":  wallet
        ]
        if let exp = expires { payload["expires"] = exp }
        post(path: "/card/activate", payload: payload, completion: completion)
    }

    // MARK: Identity Registration
    func registerIdentity(
        btngId:     String,
        wallet:     String,
        expires:    String,
        completion: @escaping ([String: Any]?) -> Void
    ) {
        let payload: [String: Any] = [
            "btng_id": btngId,
            "wallet":  wallet,
            "expires": expires
        ]
        post(path: "/identity", payload: payload, completion: completion)
    }

    // MARK: Local Loan Quote (offline fallback)
    func localLoanQuote(btngId: String, principal: Double, days: Int) -> [String: Any] {
        let maxBorrow = principal * MAX_LTV
        let dailyRate = BASE_RATE_APR / 365.0
        let interest  = maxBorrow * dailyRate * Double(days)
        let risk: String
        if principal > 50000      { risk = "HIGH" }
        else if principal > 10000 { risk = "MEDIUM" }
        else                      { risk = "LOW" }
        return [
            "btng_id":    btngId,
            "principal":  principal,
            "max_borrow": (maxBorrow  * 100).rounded() / 100,
            "interest":   (interest   * 100).rounded() / 100,
            "total_due":  ((maxBorrow + interest) * 100).rounded() / 100,
            "currency":   GOLD_SYMBOL,
            "rate_apr":   BASE_RATE_APR,
            "ltv":        MAX_LTV,
            "risk_level": risk,
            "source":     "local"
        ]
    }

    // MARK: - Private Helpers
    private func addHeaders(_ req: inout URLRequest) {
        req.setValue("application/json",   forHTTPHeaderField: "Content-Type")
        req.setValue(CLIENT_TAG,           forHTTPHeaderField: "X-BTNG-Client")
        req.setValue(UBL_VERSION,          forHTTPHeaderField: "X-BTNG-UBL")
        req.setValue(CHAIN_PREFIX,         forHTTPHeaderField: "X-BTNG-Chain")
    }

    private func post(
        path:       String,
        payload:    [String: Any],
        completion: @escaping ([String: Any]?) -> Void
    ) {
        guard let url = URL(string: "\(baseUrl)\(path)") else {
            completion(nil); return
        }
        var req = URLRequest(url: url)
        req.httpMethod = "POST"
        addHeaders(&req)
        req.httpBody = try? JSONSerialization.data(withJSONObject: payload)
        session.dataTask(with: req) { data, _, _ in
            completion(self.parseJson(data))
        }.resume()
    }

    private func parseJson(_ data: Data?) -> [String: Any]? {
        guard let data = data,
              let json = try? JSONSerialization.jsonObject(with: data) as? [String: Any]
        else { return nil }
        return json
    }
}
