// SPDX-License-Identifier: MIT
pragma solidity ^0.8.22;

/**
 * LocalOSTreasury: non-upgradable USDC and token treasury for LocalOS.
 *
 * Users send USDC to a backend-generated fresh wallet. The backend relays
 * the USDC to this contract. Only the owner (DEPLOYER wallet) can withdraw.
 *
 * Deployment: Base mainnet
 * License: MIT (SPDX above is read by Basescan during verification)
 */
contract LocalOSTreasury {

    address public owner;

    event TokenWithdrawn(address indexed token, address indexed to, uint256 amount);
    event ETHWithdrawn(address indexed to, uint256 amount);
    event OwnershipTransferred(address indexed previousOwner, address indexed newOwner);

    modifier onlyOwner() {
        require(msg.sender == owner, "LocalOSTreasury: not owner");
        _;
    }

    constructor(address _owner) {
        require(_owner != address(0), "LocalOSTreasury: zero address");
        owner = _owner;
    }

    receive() external payable {}

    /**
     * Withdraw a specific amount of any ERC20 token to a recipient address.
     * Use this to withdraw USDC or any future LocalOS tokens from the treasury.
     */
    function withdrawToken(address token, address to, uint256 amount) external onlyOwner {
        require(to != address(0), "LocalOSTreasury: zero address");
        require(amount > 0, "LocalOSTreasury: zero amount");
        (bool ok, bytes memory data) = token.call(
            abi.encodeWithSignature("transfer(address,uint256)", to, amount)
        );
        require(ok && (data.length == 0 || abi.decode(data, (bool))), "LocalOSTreasury: transfer failed");
        emit TokenWithdrawn(token, to, amount);
    }

    /**
     * Withdraw the full balance of any ERC20 token to a recipient address.
     */
    function withdrawAllToken(address token, address to) external onlyOwner {
        require(to != address(0), "LocalOSTreasury: zero address");
        (, bytes memory balData) = token.staticcall(
            abi.encodeWithSignature("balanceOf(address)", address(this))
        );
        uint256 bal = abi.decode(balData, (uint256));
        require(bal > 0, "LocalOSTreasury: zero balance");
        (bool ok, bytes memory data) = token.call(
            abi.encodeWithSignature("transfer(address,uint256)", to, bal)
        );
        require(ok && (data.length == 0 || abi.decode(data, (bool))), "LocalOSTreasury: transfer failed");
        emit TokenWithdrawn(token, to, bal);
    }

    /**
     * Withdraw a specific amount of ETH to a recipient address.
     */
    function withdrawETH(address payable to, uint256 amount) external onlyOwner {
        require(to != address(0), "LocalOSTreasury: zero address");
        require(amount > 0, "LocalOSTreasury: zero amount");
        require(address(this).balance >= amount, "LocalOSTreasury: insufficient ETH");
        (bool ok,) = to.call{value: amount}("");
        require(ok, "LocalOSTreasury: ETH transfer failed");
        emit ETHWithdrawn(to, amount);
    }

    /**
     * Transfer ownership to a new address.
     */
    function transferOwnership(address newOwner) external onlyOwner {
        require(newOwner != address(0), "LocalOSTreasury: zero address");
        emit OwnershipTransferred(owner, newOwner);
        owner = newOwner;
    }
}
