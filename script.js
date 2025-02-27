// Initialize the cart by loading from sessionStorage, or create an empty array if not found
let cart = JSON.parse(sessionStorage.getItem('cart')) || [];
let isOrderProcessed = false; // Flag to track if the order is already processed

// Function to add items to the cart
function addToCart(itemName, price) {
    const item = { name: itemName, price: price };
    cart.push(item);
    sessionStorage.setItem('cart', JSON.stringify(cart)); // Store cart in sessionStorage
    updateCart();
}

// Function to remove items from the cart
function removeFromCart(index) {
    cart.splice(index, 1); // Remove item by index
    sessionStorage.setItem('cart', JSON.stringify(cart)); // Update cart in sessionStorage
    updateCart(); // Update cart display
}

// Function to update the cart display
function updateCart() {
    const cartLink = document.getElementById('cart-link');
    const cartItemsDiv = document.getElementById('cart-items');
    const cartTotal = document.getElementById('cart-total');

    // Update cart link with the number of items
    if (cartLink) {
        cartLink.textContent = `Cart (${cart.length})`;
    }

    // Update the cart items section and total
    if (cart.length > 0) {
        let total = 0;
        cartItemsDiv.innerHTML = ''; // Clear existing cart items

        cart.forEach((item, index) => {
            total += item.price;
            const itemDiv = document.createElement('div');
            itemDiv.textContent = `${item.name} - $${item.price}`;

            // Add a remove button for each item
            const removeButton = document.createElement('button');
            removeButton.textContent = 'Remove';
            removeButton.onclick = () => removeFromCart(index); // Pass index to remove item
            itemDiv.appendChild(removeButton);

            cartItemsDiv.appendChild(itemDiv);
        });

        // Display the total
        cartTotal.textContent = `Total: $${total}`;

        if (document.getElementById('cart')) {
            document.getElementById('cart').style.display = 'block';
        }
    } else {
        cartItemsDiv.innerHTML = 'Your cart is empty.';
        cartTotal.textContent = 'Total: $0';
        if (document.getElementById('cart')) {
            document.getElementById('cart').style.display = 'none';
        }
    }
}

// Checkout process (clear the cart and display total)
function checkout() {
    if (isOrderProcessed) {
        alert("Your order has already been processed!");
    } else {
        if (cart.length === 0) {
            alert('Your cart is empty!');
        } else {
            let total = cart.reduce((acc, item) => acc + item.price, 0);
            alert(`Your total is $${total}. Thank you for your purchase!`);
            cart = []; // Clear the cart after checkout
            sessionStorage.removeItem('cart'); // Remove cart from sessionStorage
            isOrderProcessed = true; // Mark the order as processed
            updateCart(); // Update the cart display
        }
    }
}

// Function to clear the cart (empty the cart)
function clearCart() {
    const confirmClear = confirm("Are you sure you want to clear the cart?");
    if (confirmClear) {
        cart = []; // Empty the cart
        sessionStorage.removeItem('cart'); // Remove cart data from sessionStorage
        updateCart(); // Update cart display
        alert("Your cart has been cleared!");
    }
}

// Function to display cart items when the page loads
function showCartPage() {
    // Check if the cart has been processed already
    if (isOrderProcessed) {
        alert("Your order has already been processed.");
    } else {
        updateCart();
    }
}

// Initialize the cart display when the page loads
showCartPage();